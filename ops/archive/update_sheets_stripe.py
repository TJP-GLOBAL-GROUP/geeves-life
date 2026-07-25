#!/usr/bin/env python3
"""
Update Google Sheets workbook with Stripe transaction data:
1. Add a "Stripe Transactions" sheet with all classified transactions
2. Update Summary Dashboard with Stripe income by vertical
3. Add Stripe fees as deductible expenses for Bohemian Lodges
"""
import mysql.connector
from urllib.parse import urlparse
import json, os, subprocess, hashlib, base64
from datetime import datetime, timezone
from google.oauth2 import service_account
from googleapiclient.discovery import build

# --- Config ---
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

# --- Get service account key ---
with open('/home/ubuntu/tax_prep/sa_info.json', 'r') as f:
    sa_info = json.load(f)

# --- Google Sheets setup ---
creds = service_account.Credentials.from_service_account_info(sa_info, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets_service = build('sheets', 'v4', credentials=creds)

# --- Database connection ---
parsed = urlparse(DB_URL)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
cursor = conn.cursor(dictionary=True)

# --- Get Stripe data by vertical and year ---
print("Fetching Stripe transaction data...")

# Income by vertical and year
cursor.execute("""
    SELECT business_vertical, YEAR(created_at) as yr,
           COUNT(*) as cnt, SUM(amount) as gross, SUM(fee) as fees, SUM(net) as net
    FROM stripe_transactions
    WHERE type = 'charge'
    GROUP BY business_vertical, YEAR(created_at)
    ORDER BY business_vertical, yr
""")
income_by_vertical = cursor.fetchall()

# All charges for detail sheet
cursor.execute("""
    SELECT stripe_txn_id, type, amount, fee, net, created_at, description,
           business_vertical, sub_category, booking_confirmation, order_reference,
           customer_facing_amount, customer_facing_currency
    FROM stripe_transactions
    WHERE type = 'charge'
    ORDER BY created_at
""")
all_charges = cursor.fetchall()

# Platform fees (Stripe service fees - Radar etc)
cursor.execute("""
    SELECT YEAR(created_at) as yr, SUM(ABS(amount)) as total_fees
    FROM stripe_transactions
    WHERE business_vertical = 'platform_fee'
    GROUP BY YEAR(created_at)
""")
platform_fees = cursor.fetchall()

# Stripe processing fees by vertical
cursor.execute("""
    SELECT business_vertical, YEAR(created_at) as yr, SUM(fee) as processing_fees
    FROM stripe_transactions
    WHERE type = 'charge'
    GROUP BY business_vertical, YEAR(created_at)
    ORDER BY business_vertical, yr
""")
processing_fees = cursor.fetchall()

conn.close()

# --- Build Stripe Transactions sheet ---
print("Building Stripe Transactions sheet...")
stripe_header = [
    'Date', 'Stripe ID', 'Business Vertical', 'Category', 'Description',
    'Gross Amount (USD)', 'Stripe Fee', 'Net Amount', 
    'Customer Amount', 'Customer Currency', 'Guest/Order Reference'
]

stripe_rows = [stripe_header]
for r in all_charges:
    stripe_rows.append([
        r['created_at'].strftime('%Y-%m-%d'),
        r['stripe_txn_id'],
        r['business_vertical'].replace('_', ' ').title(),
        r['sub_category'].replace('_', ' ').title() if r['sub_category'] else '',
        str(r['description'] or '')[:80],
        float(r['amount']),
        float(r['fee']),
        float(r['net']),
        float(r['customer_facing_amount']) if r['customer_facing_amount'] else '',
        r['customer_facing_currency'] or '',
        r['order_reference'] or r['booking_confirmation'] or ''
    ])

# --- Build Stripe Summary sheet ---
print("Building Stripe Summary sheet...")
summary_header = ['Stripe Income & Fees Summary', '', '', '', '', '']
summary_rows = [
    summary_header,
    [''],
    ['INCOME BY VERTICAL', 'Year', 'Transactions', 'Gross Income', 'Stripe Fees', 'Net Income'],
]

for r in income_by_vertical:
    summary_rows.append([
        r['business_vertical'].replace('_', ' ').title(),
        int(r['yr']),
        int(r['cnt']),
        float(r['gross']),
        float(r['fees']),
        float(r['net'])
    ])

# Totals
total_gross = sum(float(r['gross']) for r in income_by_vertical)
total_fees = sum(float(r['fees']) for r in income_by_vertical)
total_net = sum(float(r['net']) for r in income_by_vertical)
summary_rows.append(['TOTAL', '', sum(int(r['cnt']) for r in income_by_vertical), total_gross, total_fees, total_net])

summary_rows.append([''])
summary_rows.append(['STRIPE PROCESSING FEES (Deductible by Vertical)', '', '', '', '', ''])
summary_rows.append(['Vertical', 'Year', '', 'Processing Fees', '', ''])
for r in processing_fees:
    summary_rows.append([
        r['business_vertical'].replace('_', ' ').title(),
        int(r['yr']),
        '',
        float(r['processing_fees']),
        '',
        ''
    ])

summary_rows.append([''])
summary_rows.append(['PLATFORM FEES (Radar, etc.)', '', '', '', '', ''])
for r in platform_fees:
    summary_rows.append([f"Year {int(r['yr'])}", '', '', float(r['total_fees']), '', ''])

summary_rows.append([''])
summary_rows.append(['NOTES:', '', '', '', '', ''])
summary_rows.append(['- Bohemian Lodges income is from Jamaica property (Artiste\'s Boutique) via Stripe payment links', '', '', '', '', ''])
summary_rows.append(['- Maxfield Bakery income is JMD orders processed through Maxfield Market Stripe account', '', '', '', '', ''])
summary_rows.append(['- Maxfield Market income is website e-commerce orders (Magento)', '', '', '', '', ''])
summary_rows.append(['- All Stripe processing fees are deductible business expenses for the respective vertical', '', '', '', '', ''])
summary_rows.append(['- Bohemian Lodges "cancelled" bookings with Stripe payments = non-refundable deposits (confirmed income)', '', '', '', '', ''])

# --- Create/Update sheets ---
print("Updating Google Sheets...")

# Get existing sheets
spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
existing_sheets = {s['properties']['title']: s['properties']['sheetId'] for s in spreadsheet['sheets']}

requests_batch = []

# Delete existing Stripe sheets if they exist
for sheet_name in ['Stripe Transactions', 'Stripe Summary']:
    if sheet_name in existing_sheets:
        requests_batch.append({'deleteSheet': {'sheetId': existing_sheets[sheet_name]}})

# Add new sheets
requests_batch.append({
    'addSheet': {'properties': {'title': 'Stripe Summary', 'index': 1}}
})
requests_batch.append({
    'addSheet': {'properties': {'title': 'Stripe Transactions', 'index': 2}}
})

if requests_batch:
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': requests_batch}
    ).execute()
    print("  Sheets created/replaced")

# Write Stripe Summary
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range='Stripe Summary!A1',
    valueInputOption='USER_ENTERED',
    body={'values': summary_rows}
).execute()
print(f"  Stripe Summary: {len(summary_rows)} rows written")

# Write Stripe Transactions
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range='Stripe Transactions!A1',
    valueInputOption='USER_ENTERED',
    body={'values': stripe_rows}
).execute()
print(f"  Stripe Transactions: {len(stripe_rows)} rows written")

# --- Also add Stripe fees to the expense sheets ---
# Bohemian Lodges Stripe fees go into 2025 Expenses
print("\nAdding Stripe processing fees to expense sheets...")

# Check if we already have Stripe fees in 2025 expenses
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=SPREADSHEET_ID,
    range='2025 Expenses (Detail)!A1:H200'
).execute()
existing_data = result.get('values', [])

# Check if Stripe fees already added
stripe_fee_exists = any('Stripe Processing' in str(row) for row in existing_data)

if not stripe_fee_exists:
    # Add Stripe processing fees as expenses for Bohemian Lodges
    # Group by month for cleaner reporting
    conn2 = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
    cur2 = conn2.cursor(dictionary=True)
    
    cur2.execute("""
        SELECT DATE_FORMAT(created_at, '%%Y-%%m') as month, 
               SUM(fee) as monthly_fees, COUNT(*) as txn_count
        FROM stripe_transactions
        WHERE business_vertical = 'bohemian_lodges' AND type = 'charge'
        AND YEAR(created_at) = 2025
        GROUP BY DATE_FORMAT(created_at, '%%Y-%%m')
        ORDER BY month
    """)
    monthly_fees = cur2.fetchall()
    
    # Append to 2025 Expenses
    new_rows = []
    for mf in monthly_fees:
        new_rows.append([
            mf['month'] + '-01',  # Date
            "The Artiste's Boutique",  # Property
            'Stripe Processing Fees',  # Category
            f"Stripe fees for {mf['txn_count']} Bohemian Lodges transactions ({mf['month']})",  # Description
            float(mf['monthly_fees']),  # Amount
            'Stripe',  # Vendor
            'stripe_fee',  # Type
            'Confirmed'  # Status
        ])
    
    if new_rows:
        next_row = len(existing_data) + 1
        sheets_service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f'2025 Expenses (Detail)!A{next_row}',
            valueInputOption='USER_ENTERED',
            body={'values': new_rows}
        ).execute()
        print(f"  Added {len(new_rows)} Stripe fee expense rows to 2025 Expenses")
    
    conn2.close()
else:
    print("  Stripe fees already in 2025 Expenses - skipping")

print("\n✅ Google Sheets updated with Stripe data!")
print(f"   Workbook: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
