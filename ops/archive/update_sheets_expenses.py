#!/usr/bin/env python3
"""
Update Google Sheets tax workbook with comprehensive expense data:
- Vendor orders (Amazon, Walmart, Wayfair, Home Depot) by property and year
- Contractor payments (Zelle, Venmo) by property and year
- Summary totals on the Dashboard

Creates new sheets: "2024 Expenses (Detail)", "2025 Expenses (Detail)", "2026 Expenses (Detail)"
Updates: Summary Dashboard with expense totals
"""
import mysql.connector
from urllib.parse import urlparse
from google.oauth2 import service_account
from googleapiclient.discovery import build
from decimal import Decimal
from datetime import date, datetime

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

def to_float(val):
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)

def date_str(val):
    if val is None:
        return ''
    if isinstance(val, (date, datetime)):
        return val.strftime('%Y-%m-%d')
    return str(val)

# --- Fetch all property-attributed expenses ---
print("Fetching vendor orders...")
cursor.execute("""
    SELECT o.orderDate, o.vendor, o.totalAmount, o.propertyAttribution, 
           o.expenseCategory, o.orderNumber,
           GROUP_CONCAT(oi.name SEPARATOR '; ') as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.orderId
    WHERE o.propertyAttribution IN ('sunset_studio', 'artistes_boutique', 'morabeza', 'sunset_and_morabeza')
    GROUP BY o.id
    ORDER BY o.orderDate
""")
vendor_orders = cursor.fetchall()
print(f"  Found {len(vendor_orders)} property-attributed vendor orders")

print("Fetching contractor payments...")
cursor.execute("""
    SELECT paymentDate, recipientName, amount, platform, note, 
           propertyAttribution, expenseCategory
    FROM contractor_payments
    WHERE isTaxDeductible = 1
    ORDER BY paymentDate
""")
contractor_payments = cursor.fetchall()
print(f"  Found {len(contractor_payments)} tax-deductible contractor payments")

# --- Organize by year ---
def get_year(d):
    if isinstance(d, (date, datetime)):
        return d.year
    if isinstance(d, str) and len(d) >= 4:
        return int(d[:4])
    return 0

expenses_by_year = {2024: [], 2025: [], 2026: []}

# Add vendor orders
for o in vendor_orders:
    yr = get_year(o['orderDate'])
    if yr in expenses_by_year:
        prop = o['propertyAttribution'] or 'unclassified'
        # Normalize property names for display
        prop_display = {
            'sunset_studio': 'Sunset Studio',
            'artistes_boutique': "Artiste's Boutique",
            'morabeza': 'Morabeza',
            'sunset_and_morabeza': 'Sunset Studio + Morabeza',
        }.get(prop, prop)
        
        expenses_by_year[yr].append({
            'date': date_str(o['orderDate']),
            'type': 'Vendor Order',
            'vendor_or_recipient': o['vendor'] or '',
            'description': (o['items'] or '')[:100],
            'category': o['expenseCategory'] or '',
            'amount': to_float(o['totalAmount']),
            'property': prop_display,
            'reference': o['orderNumber'] or '',
            'platform': o['vendor'] or '',
        })

# Add contractor payments
for p in contractor_payments:
    yr = get_year(p['paymentDate'])
    if yr in expenses_by_year:
        prop = p['propertyAttribution'] or 'unclassified'
        prop_display = {
            'sunset_studio': 'Sunset Studio',
            'artistes_boutique': "Artiste's Boutique",
            'morabeza': 'Morabeza',
            'sunset_and_morabeza': 'Sunset Studio + Morabeza',
        }.get(prop, prop)
        
        expenses_by_year[yr].append({
            'date': date_str(p['paymentDate']),
            'type': 'Contractor Payment',
            'vendor_or_recipient': p['recipientName'] or '',
            'description': p['note'] or '',
            'category': p['expenseCategory'] or '',
            'amount': to_float(p['amount']),
            'property': prop_display,
            'reference': '',
            'platform': p['platform'] or '',
        })

# Sort each year by date
for yr in expenses_by_year:
    expenses_by_year[yr].sort(key=lambda x: x['date'])

# --- Print summary ---
print("\n=== EXPENSE SUMMARY BY YEAR ===")
for yr, items in expenses_by_year.items():
    total = sum(i['amount'] for i in items)
    print(f"  {yr}: {len(items)} expenses, total ${total:,.2f}")
    # By property
    by_prop = {}
    for i in items:
        by_prop.setdefault(i['property'], {'count': 0, 'total': 0})
        by_prop[i['property']]['count'] += 1
        by_prop[i['property']]['total'] += i['amount']
    for prop, data in sorted(by_prop.items(), key=lambda x: -x[1]['total']):
        print(f"    {prop}: {data['count']} items, ${data['total']:,.2f}")

# --- Build sheet data ---
HEADER = ['Date', 'Type', 'Vendor/Recipient', 'Description', 'Category', 'Amount (USD)', 'Property', 'Reference', 'Payment Platform']

def build_sheet_rows(year):
    rows = [HEADER]
    items = expenses_by_year.get(year, [])
    for item in items:
        rows.append([
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
    # Add totals row
    total = sum(i['amount'] for i in items)
    rows.append([])
    rows.append(['', '', '', '', 'TOTAL', f"${total:,.2f}", '', '', ''])
    
    # Add property subtotals
    rows.append([])
    rows.append(['', '', '', '', '--- BY PROPERTY ---', '', '', '', ''])
    by_prop = {}
    for i in items:
        by_prop.setdefault(i['property'], 0)
        by_prop[i['property']] += i['amount']
    for prop, amt in sorted(by_prop.items(), key=lambda x: -x[1]):
        rows.append(['', '', '', '', prop, f"${amt:,.2f}", '', '', ''])
    
    # Add category subtotals
    rows.append([])
    rows.append(['', '', '', '', '--- BY CATEGORY ---', '', '', '', ''])
    by_cat = {}
    for i in items:
        cat = i['category'] or 'uncategorized'
        by_cat.setdefault(cat, 0)
        by_cat[cat] += i['amount']
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        rows.append(['', '', '', '', cat, f"${amt:,.2f}", '', '', ''])
    
    return rows

# --- Create/Update sheets ---
print("\n=== UPDATING GOOGLE SHEETS ===")

# First, get existing sheet IDs to check if our expense detail sheets exist
result = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
existing_sheets = {s['properties']['title']: s['properties']['sheetId'] for s in result['sheets']}

# Create or clear expense detail sheets for each year
for year in [2024, 2025, 2026]:
    sheet_title = f"{year} Expenses (Detail)"
    
    if sheet_title in existing_sheets:
        # Clear existing content
        print(f"  Clearing existing '{sheet_title}'...")
        sheets_service.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{sheet_title}'!A:Z"
        ).execute()
    else:
        # Create new sheet
        print(f"  Creating '{sheet_title}'...")
        body = {
            'requests': [{
                'addSheet': {
                    'properties': {
                        'title': sheet_title,
                        'gridProperties': {'rowCount': 2000, 'columnCount': 10}
                    }
                }
            }]
        }
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID, body=body
        ).execute()
    
    # Write data
    rows = build_sheet_rows(year)
    print(f"  Writing {len(rows)} rows to '{sheet_title}'...")
    sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A1",
        valueInputOption='USER_ENTERED',
        body={'values': rows}
    ).execute()

# --- Update Summary Dashboard with expense totals ---
print("\n  Updating Summary Dashboard with expense totals...")

# Read current dashboard
dashboard_result = sheets_service.spreadsheets().values().get(
    spreadsheetId=SPREADSHEET_ID,
    range="'Summary Dashboard'!A1:Z50"
).execute()
current_dashboard = dashboard_result.get('values', [])

# Build expense summary rows to append after existing content
expense_summary_rows = [
    [],
    ['--- EXPENSES (Tax Deductible) ---'],
    ['Metric', '2024', '2025', '2026 YTD'],
]

# Total expenses by year
for yr in [2024, 2025, 2026]:
    total = sum(i['amount'] for i in expenses_by_year.get(yr, []))
    expense_summary_rows[2].append('')  # placeholder

expense_summary_rows.append([
    'Total Property Expenses (USD)',
    f"${sum(i['amount'] for i in expenses_by_year.get(2024, [])):,.2f}",
    f"${sum(i['amount'] for i in expenses_by_year.get(2025, [])):,.2f}",
    f"${sum(i['amount'] for i in expenses_by_year.get(2026, [])):,.2f}",
])

# By property
expense_summary_rows.append([])
expense_summary_rows.append(['--- Expenses By Property ---'])

properties = ['Morabeza', 'Sunset Studio', "Artiste's Boutique", 'Sunset Studio + Morabeza']
for prop in properties:
    row = [f"{prop} - Expenses"]
    for yr in [2024, 2025, 2026]:
        total = sum(i['amount'] for i in expenses_by_year.get(yr, []) if i['property'] == prop)
        row.append(f"${total:,.2f}")
    expense_summary_rows.append(row)

# By category
expense_summary_rows.append([])
expense_summary_rows.append(['--- Expenses By Category ---'])
all_categories = set()
for yr in expenses_by_year:
    for i in expenses_by_year[yr]:
        all_categories.add(i['category'] or 'uncategorized')

for cat in sorted(all_categories):
    row = [cat.replace('_', ' ').title()]
    for yr in [2024, 2025, 2026]:
        total = sum(i['amount'] for i in expenses_by_year.get(yr, []) if (i['category'] or 'uncategorized') == cat)
        if total > 0:
            row.append(f"${total:,.2f}")
        else:
            row.append('$0.00')
    expense_summary_rows.append(row)

# Net profit row
expense_summary_rows.append([])
expense_summary_rows.append(['--- NET PROFIT (Income - Expenses) ---'])

# Get income from existing dashboard
income_by_year = {}
for row in current_dashboard:
    if row and 'Total Net Payout' in str(row[0]):
        for i, yr in enumerate([2024, 2025, 2026], 1):
            if i < len(row):
                val = row[i].replace('$', '').replace(',', '')
                try:
                    income_by_year[yr] = float(val)
                except:
                    income_by_year[yr] = 0

net_profit_row = ['Net Profit (Net Payout - Expenses)']
for yr in [2024, 2025, 2026]:
    income = income_by_year.get(yr, 0)
    expenses = sum(i['amount'] for i in expenses_by_year.get(yr, []))
    net = income - expenses
    net_profit_row.append(f"${net:,.2f}")
expense_summary_rows.append(net_profit_row)

# Find where to insert expense data in dashboard (after existing income data)
# Look for existing expense section or append at end
insert_row = len(current_dashboard) + 1
for i, row in enumerate(current_dashboard):
    if row and '--- EXPENSES' in str(row[0]):
        insert_row = i + 1
        break

# Clear any old expense section and write new one
if insert_row <= len(current_dashboard):
    # Clear from insert_row onwards
    sheets_service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'Summary Dashboard'!A{insert_row}:Z100"
    ).execute()

# Write expense summary
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range=f"'Summary Dashboard'!A{insert_row}",
    valueInputOption='USER_ENTERED',
    body={'values': expense_summary_rows}
).execute()

print(f"  Written {len(expense_summary_rows)} rows to Summary Dashboard starting at row {insert_row}")

# --- Also update the "2025 Expenses" sheet with actual data ---
print("\n  Updating '2025 Expenses' sheet with actual data...")
# This sheet had placeholder rows with $0 - let's populate it properly
expenses_2025_rows = [
    ['Date', 'Month', 'Category', 'Description', 'Vendor/Recipient', 'Amount (USD)', 'Property', 'Type']
]
for item in expenses_by_year.get(2025, []):
    month_name = ''
    try:
        d = datetime.strptime(item['date'], '%Y-%m-%d')
        month_name = d.strftime('%B')
    except:
        pass
    expenses_2025_rows.append([
        item['date'],
        month_name,
        item['category'],
        item['description'],
        item['vendor_or_recipient'],
        f"${item['amount']:,.2f}",
        item['property'],
        item['type'],
    ])

# Clear and write
sheets_service.spreadsheets().values().clear(
    spreadsheetId=SPREADSHEET_ID,
    range="'2025 Expenses'!A:Z"
).execute()
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range="'2025 Expenses'!A1",
    valueInputOption='USER_ENTERED',
    body={'values': expenses_2025_rows}
).execute()
print(f"  Written {len(expenses_2025_rows)} rows to '2025 Expenses'")

conn.close()
print("\n✅ Google Sheets workbook updated successfully!")
print(f"   URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
