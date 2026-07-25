#!/usr/bin/env python3
"""
Add platform commission expenses to the Google Sheets tax workbook.
Commissions paid to Airbnb, VRBO, and Booking.com are deductible business expenses.
Appends commission line items to the existing Expense Detail sheets and updates the Summary Dashboard.
"""
import mysql.connector
from urllib.parse import urlparse
from decimal import Decimal
from datetime import date, datetime, timezone
from collections import defaultdict
from google.oauth2 import service_account
from googleapiclient.discovery import build

# --- Config ---
SPREADSHEET_ID = "1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI"
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

# --- Auth ---
sa_email = open('/home/ubuntu/tax_prep/.sa_email').read().strip()
sa_key = open('/home/ubuntu/tax_prep/.sa_key').read().strip()

credentials_info = {
    "type": "service_account",
    "project_id": "geeves-495802",
    "private_key_id": "auto",
    "private_key": sa_key,
    "client_email": sa_email,
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
credentials = service_account.Credentials.from_service_account_info(credentials_info, scopes=SCOPES)
sheets_service = build('sheets', 'v4', credentials=credentials)

# --- Database ---
parsed = urlparse(DB_URL)
conn = mysql.connector.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl_disabled=False
)
cursor = conn.cursor(dictionary=True)

def ms_to_date(ms):
    if ms is None or ms == 0:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()

def ms_to_year(ms):
    d = ms_to_date(ms)
    return d.year if d else 0

# --- Fetch all bookings with commissions ---
print("Fetching booking commissions...")
cursor.execute("""
    SELECT 
        pb.checkIn,
        pb.checkOut,
        pb.guestName,
        pb.confirmationNumber,
        pb.totalPrice,
        pb.commissionAmount,
        pb.netAmount,
        pb.currency,
        pp.platform,
        p.name as propertyName
    FROM property_bookings pb
    LEFT JOIN property_platforms pp ON pb.platformId = pp.id
    LEFT JOIN properties p ON pp.propertyId = p.id
    WHERE pb.commissionAmount > 0
    ORDER BY pb.checkIn
""")

bookings = cursor.fetchall()
print(f"  Found {len(bookings)} bookings with commission data")

# --- Organize commission expenses by year ---
commissions_by_year = {2024: [], 2025: [], 2026: []}

platform_names = {
    'airbnb': 'Airbnb',
    'vrbo': 'VRBO',
    'booking_com': 'Booking.com',
}

for b in bookings:
    year = ms_to_year(b['checkIn'])
    if year not in commissions_by_year:
        continue
    
    check_in = ms_to_date(b['checkIn'])
    check_out = ms_to_date(b['checkOut'])
    platform = platform_names.get(b['platform'], b['platform'] or 'Unknown')
    prop = b['propertyName'] or 'Unknown'
    commission = float(b['commissionAmount'] or 0)
    
    description = f"Commission on booking {b['confirmationNumber'] or ''} ({b['guestName'] or 'Guest'}, {check_in} to {check_out})"
    
    commissions_by_year[year].append({
        'date': check_in.strftime('%Y-%m-%d') if check_in else '',
        'type': 'Platform Commission',
        'vendor_or_recipient': platform,
        'description': description,
        'category': 'platform_commission',
        'amount': commission,
        'property': prop,
        'reference': b['confirmationNumber'] or '',
        'platform': platform,
    })

# Sort by date
for yr in commissions_by_year:
    commissions_by_year[yr].sort(key=lambda x: x['date'])

# --- Print summary ---
print("\n=== COMMISSION EXPENSES TO ADD ===")
for yr, items in commissions_by_year.items():
    total = sum(i['amount'] for i in items)
    print(f"  {yr}: {len(items)} commission expenses, total ${total:,.2f}")
    by_prop = defaultdict(float)
    for i in items:
        by_prop[i['property']] += i['amount']
    for prop, amt in sorted(by_prop.items(), key=lambda x: -x[1]):
        print(f"    {prop}: ${amt:,.2f}")

# --- Update Google Sheets ---
print("\n=== UPDATING GOOGLE SHEETS ===")

# For each year, read existing expense detail sheet, append commission rows
for year in [2024, 2025, 2026]:
    sheet_title = f"{year} Expenses (Detail)"
    items = commissions_by_year.get(year, [])
    if not items:
        print(f"  No commissions for {year}, skipping")
        continue
    
    # Read current content to find where to append
    result = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A:A"
    ).execute()
    current_rows = result.get('values', [])
    
    # Find the first empty row or the row before totals
    # We'll insert commission rows before the totals section
    insert_at = None
    for i, row in enumerate(current_rows):
        if row and row[0] == '' and i > 0:
            # Found empty row (likely before totals)
            insert_at = i
            break
    
    if insert_at is None:
        insert_at = len(current_rows)
    
    # Build commission rows
    commission_rows = []
    for item in items:
        commission_rows.append([
            item['date'],
            item['type'],
            item['vendor_or_recipient'],
            item['description'],
            item['category'],
            f"${item['amount']:,.2f}",
            item['property'],
            item['reference'],
            item['platform'],
        ])
    
    # We need to insert these before the totals. Let's clear the sheet and rewrite with commissions included.
    # Read all current data
    full_result = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A:I"
    ).execute()
    all_rows = full_result.get('values', [])
    
    # Find where the data ends (before empty row that precedes totals)
    data_end = 0
    for i in range(1, len(all_rows)):  # skip header
        if all_rows[i] and all_rows[i][0]:
            data_end = i
        else:
            break
    
    # Insert commission rows after the last data row
    header = all_rows[0] if all_rows else ['Date', 'Type', 'Vendor/Recipient', 'Description', 'Category', 'Amount (USD)', 'Property', 'Reference', 'Payment Platform']
    data_rows = all_rows[1:data_end+1] if data_end > 0 else []
    
    # Combine: header + existing data + commission data
    new_rows = [header] + data_rows + commission_rows
    
    # Add totals
    all_items_total = 0
    for row in data_rows + commission_rows:
        try:
            amt_str = row[5] if len(row) > 5 else '0'
            amt = float(amt_str.replace('$', '').replace(',', ''))
            all_items_total += amt
        except:
            pass
    
    new_rows.append([])
    new_rows.append(['', '', '', '', 'TOTAL', f"${all_items_total:,.2f}", '', '', ''])
    
    # Property subtotals
    by_prop = defaultdict(float)
    for row in data_rows + commission_rows:
        try:
            amt = float(row[5].replace('$', '').replace(',', '')) if len(row) > 5 else 0
            prop = row[6] if len(row) > 6 else ''
            by_prop[prop] += amt
        except:
            pass
    
    new_rows.append([])
    new_rows.append(['', '', '', '', '--- BY PROPERTY ---', '', '', '', ''])
    for prop, amt in sorted(by_prop.items(), key=lambda x: -x[1]):
        if prop:
            new_rows.append(['', '', '', '', prop, f"${amt:,.2f}", '', '', ''])
    
    # Category subtotals
    by_cat = defaultdict(float)
    for row in data_rows + commission_rows:
        try:
            amt = float(row[5].replace('$', '').replace(',', '')) if len(row) > 5 else 0
            cat = row[4] if len(row) > 4 else ''
            by_cat[cat] += amt
        except:
            pass
    
    new_rows.append([])
    new_rows.append(['', '', '', '', '--- BY CATEGORY ---', '', '', '', ''])
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        if cat and cat not in ('TOTAL', '--- BY PROPERTY ---', '--- BY CATEGORY ---'):
            new_rows.append(['', '', '', '', cat, f"${amt:,.2f}", '', '', ''])
    
    # Clear and rewrite
    print(f"  Rewriting '{sheet_title}' with {len(commission_rows)} commission rows added...")
    sheets_service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A:Z"
    ).execute()
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A1",
        valueInputOption='USER_ENTERED',
        body={'values': new_rows}
    ).execute()
    print(f"    Written {len(new_rows)} total rows (was {len(all_rows)}, added {len(commission_rows)} commissions)")

# --- Update Summary Dashboard ---
print("\n  Updating Summary Dashboard with commission totals...")

# Read current dashboard
dashboard_result = sheets_service.spreadsheets().values().get(
    spreadsheetId=SPREADSHEET_ID,
    range="'Summary Dashboard'!A1:E50"
).execute()
current_dashboard = dashboard_result.get('values', [])

# Find the expense section and update totals
# We need to recalculate with commissions included
# First get the original contractor+vendor expenses from DB
cursor.execute("""
    SELECT 
        CASE 
            WHEN propertyAttribution = 'sunset_studio' THEN 'Sunset Studio'
            WHEN propertyAttribution = 'artistes_boutique' THEN "Artiste's Boutique"
            WHEN propertyAttribution = 'morabeza' THEN 'Morabeza'
            WHEN propertyAttribution = 'sunset_and_morabeza' THEN 'Sunset Studio + Morabeza'
            ELSE propertyAttribution
        END as prop,
        expenseCategory as cat,
        SUM(amount) as total,
        COUNT(*) as cnt
    FROM contractor_payments
    WHERE isTaxDeductible = 1
    GROUP BY propertyAttribution, expenseCategory
""")
contractor_totals = cursor.fetchall()

cursor.execute("""
    SELECT 
        CASE 
            WHEN propertyAttribution = 'sunset_studio' THEN 'Sunset Studio'
            WHEN propertyAttribution = 'artistes_boutique' THEN "Artiste's Boutique"
            WHEN propertyAttribution = 'morabeza' THEN 'Morabeza'
            WHEN propertyAttribution = 'sunset_and_morabeza' THEN 'Sunset Studio + Morabeza'
            ELSE propertyAttribution
        END as prop,
        expenseCategory as cat,
        SUM(totalAmount) as total,
        COUNT(*) as cnt
    FROM orders
    WHERE propertyAttribution IN ('sunset_studio', 'artistes_boutique', 'morabeza', 'sunset_and_morabeza')
    GROUP BY propertyAttribution, expenseCategory
""")
order_totals = cursor.fetchall()

# Calculate new totals including commissions
# By year: existing expenses + commissions
expense_totals_by_year = {2024: 0, 2025: 0, 2026: 0}
commission_totals_by_year = {2024: 0, 2025: 0, 2026: 0}

for yr, items in commissions_by_year.items():
    commission_totals_by_year[yr] = sum(i['amount'] for i in items)

# Read existing expense totals from the dashboard
for row in current_dashboard:
    if row and 'Total Property Expenses' in str(row[0]):
        for i, yr in enumerate([2024, 2025, 2026], 1):
            if i < len(row):
                try:
                    expense_totals_by_year[yr] = float(row[i].replace('$', '').replace(',', ''))
                except:
                    pass

# New totals = existing + commissions
new_expense_totals = {}
for yr in [2024, 2025, 2026]:
    new_expense_totals[yr] = expense_totals_by_year[yr] + commission_totals_by_year[yr]

# Update the dashboard rows
new_dashboard = []
for row in current_dashboard:
    if not row:
        new_dashboard.append(row)
        continue
    
    if 'Total Property Expenses' in str(row[0]):
        new_dashboard.append([
            'Total Property Expenses (USD)',
            f"${new_expense_totals[2024]:,.2f}",
            f"${new_expense_totals[2025]:,.2f}",
            f"${new_expense_totals[2026]:,.2f}",
        ])
    elif 'Net Profit' in str(row[0]) and 'Expenses' in str(row[0]):
        # Recalculate net profit
        income_row = None
        for r in current_dashboard:
            if r and 'Total Net Payout' in str(r[0]):
                income_row = r
                break
        if income_row:
            net_row = ['Net Profit (Net Payout - Expenses)']
            for i, yr in enumerate([2024, 2025, 2026], 1):
                try:
                    income = float(income_row[i].replace('$', '').replace(',', ''))
                except:
                    income = 0
                net = income - new_expense_totals[yr]
                net_row.append(f"${net:,.2f}")
            new_dashboard.append(net_row)
        else:
            new_dashboard.append(row)
    else:
        new_dashboard.append(row)

# Also add a Platform Commissions row in the expenses by category section
# Find where categories are and add commission row
found_category_section = False
commission_row_added = False
final_dashboard = []
for row in new_dashboard:
    final_dashboard.append(row)
    if row and '--- Expenses By Category ---' in str(row[0]):
        found_category_section = True
    if found_category_section and not commission_row_added:
        # Add commission row after the category header
        if row and row[0] and '---' not in str(row[0]):
            # We're in the category list, check if Platform Commission already exists
            pass
        elif row and '--- Expenses By Category ---' in str(row[0]):
            # Add platform commission as first category
            final_dashboard.append([
                'Platform Commission',
                f"${commission_totals_by_year[2024]:,.2f}",
                f"${commission_totals_by_year[2025]:,.2f}",
                f"${commission_totals_by_year[2026]:,.2f}",
            ])
            commission_row_added = True

# Write updated dashboard
sheets_service.spreadsheets().values().clear(
    spreadsheetId=SPREADSHEET_ID,
    range="'Summary Dashboard'!A:Z"
).execute()
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range="'Summary Dashboard'!A1",
    valueInputOption='USER_ENTERED',
    body={'values': final_dashboard}
).execute()
print(f"  Dashboard updated with commission totals")

# Print final summary
print("\n=== FINAL EXPENSE TOTALS (with commissions) ===")
for yr in [2024, 2025, 2026]:
    print(f"  {yr}: ${new_expense_totals[yr]:,.2f} (was ${expense_totals_by_year[yr]:,.2f} + ${commission_totals_by_year[yr]:,.2f} commissions)")

conn.close()
print("\n✅ Commission expenses added to workbook successfully!")
print(f"   URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
