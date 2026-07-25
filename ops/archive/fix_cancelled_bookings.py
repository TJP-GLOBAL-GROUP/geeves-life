#!/usr/bin/env python3
"""
Fix cancelled bookings in the Google Sheets workbook:
1. Remove cancelled bookings from 2025 Income (Enhanced) sheet
2. Correct commission expenses (remove cancelled booking commissions)
3. Update Summary Dashboard with corrected totals

Key findings:
- 2024 income: CORRECT (cancelled bookings already excluded or had $0)
- 2025 income: OVERSTATED by $14,322.33 gross / $11,904.23 net (12 cancelled Booking.com bookings included)
- 2026 income: CORRECT
- Commission expenses: overcounted by $2,637.67 total across all years
"""
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime, timezone
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
    "type": "service_account", "project_id": "geeves-495802",
    "private_key_id": "auto", "private_key": sa_key,
    "client_email": sa_email,
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}
credentials = service_account.Credentials.from_service_account_info(
    credentials_info, scopes=['https://www.googleapis.com/auth/spreadsheets'])
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

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Fix 2025 Income (Enhanced) sheet — remove cancelled bookings
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("STEP 1: Fix 2025 Income (Enhanced) — remove cancelled bookings")
print("=" * 60)

# Get cancelled confirmation numbers from DB
cursor.execute("""
    SELECT pb.confirmationNumber
    FROM property_bookings pb
    WHERE pb.bookingStatus = 'cancelled'
    AND pb.confirmationNumber IS NOT NULL
""")
cancelled_conf_nums = set(r['confirmationNumber'] for r in cursor.fetchall())
print(f"  {len(cancelled_conf_nums)} cancelled confirmation numbers in DB")

# Read current 2025 Income sheet
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=SPREADSHEET_ID,
    range="'2025 Income (Enhanced)'!A1:O70"
).execute()
rows = result.get('values', [])
header = rows[0]
conf_col = header.index('Confirmation #')

# Filter out cancelled rows
filtered_rows = [header]
removed_count = 0
for row in rows[1:]:
    conf = row[conf_col] if len(row) > conf_col else ''
    if conf in cancelled_conf_nums:
        removed_count += 1
        guest = row[5] if len(row) > 5 else ''
        print(f"    Removing: {row[0]} | {guest} | {conf}")
    else:
        filtered_rows.append(row)

print(f"  Removed {removed_count} cancelled bookings from 2025 Income sheet")
print(f"  Remaining: {len(filtered_rows)-1} confirmed bookings")

# Clear and rewrite
sheets_service.spreadsheets().values().clear(
    spreadsheetId=SPREADSHEET_ID,
    range="'2025 Income (Enhanced)'!A:Z"
).execute()
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range="'2025 Income (Enhanced)'!A1",
    valueInputOption='USER_ENTERED',
    body={'values': filtered_rows}
).execute()

# Calculate corrected 2025 income totals
gross_col = header.index('Gross Total (USD)')
net_col = header.index('Net Payout (USD)')
corrected_2025_gross = 0
corrected_2025_net = 0
for row in filtered_rows[1:]:
    try:
        g = float((row[gross_col] if len(row) > gross_col else '0').replace('$', '').replace(',', '') or '0')
    except:
        g = 0
    try:
        n = float((row[net_col] if len(row) > net_col else '0').replace('$', '').replace(',', '') or '0')
    except:
        n = 0
    corrected_2025_gross += g
    corrected_2025_net += n

print(f"  Corrected 2025 totals: Gross ${corrected_2025_gross:,.2f}, Net ${corrected_2025_net:,.2f}")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Rewrite commission expenses — confirmed bookings only
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("STEP 2: Rewrite commission expenses — confirmed only")
print("=" * 60)

# Get confirmed bookings with commissions
cursor.execute("""
    SELECT 
        pb.checkIn, pb.checkOut, pb.guestName, pb.confirmationNumber,
        pb.totalPrice, pb.commissionAmount, pb.netAmount,
        pp.platform, p.name as propertyName
    FROM property_bookings pb
    LEFT JOIN property_platforms pp ON pb.platformId = pp.id
    LEFT JOIN properties p ON pp.propertyId = p.id
    WHERE pb.commissionAmount > 0 AND pb.bookingStatus = 'confirmed'
    ORDER BY pb.checkIn
""")
confirmed_bookings = cursor.fetchall()

platform_names = {'airbnb': 'Airbnb', 'vrbo': 'VRBO', 'booking_com': 'Booking.com'}
commissions_by_year = {2024: [], 2025: [], 2026: []}

for b in confirmed_bookings:
    year = ms_to_year(b['checkIn'])
    if year not in commissions_by_year:
        continue
    check_in = ms_to_date(b['checkIn'])
    check_out = ms_to_date(b['checkOut'])
    platform = platform_names.get(b['platform'], b['platform'] or 'Unknown')
    commission = float(b['commissionAmount'] or 0)
    
    commissions_by_year[year].append({
        'date': check_in.strftime('%Y-%m-%d') if check_in else '',
        'type': 'Platform Commission',
        'vendor_or_recipient': platform,
        'description': f"Commission on booking {b['confirmationNumber'] or ''} ({b['guestName'] or 'Guest'}, {check_in} to {check_out})",
        'category': 'platform_commission',
        'amount': commission,
        'property': b['propertyName'] or 'Unknown',
        'reference': b['confirmationNumber'] or '',
        'platform': platform,
    })

for yr in commissions_by_year:
    total = sum(i['amount'] for i in commissions_by_year[yr])
    print(f"  {yr}: {len(commissions_by_year[yr])} confirmed commissions, ${total:,.2f}")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Rewrite Expense Detail sheets with corrected commissions
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("STEP 3: Rewrite Expense Detail sheets (corrected commissions)")
print("=" * 60)

# Get non-commission expenses (vendor orders + contractor payments)
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

cursor.execute("""
    SELECT paymentDate, recipientName, amount, platform, note, 
           propertyAttribution, expenseCategory
    FROM contractor_payments
    WHERE isTaxDeductible = 1
    ORDER BY paymentDate
""")
contractor_payments = cursor.fetchall()

prop_display_map = {
    'sunset_studio': 'Sunset Studio',
    'artistes_boutique': "Artiste's Boutique",
    'morabeza': 'Morabeza',
    'sunset_and_morabeza': 'Sunset Studio + Morabeza',
}

def get_year_from_date(d):
    if isinstance(d, (datetime,)):
        return d.year
    if hasattr(d, 'year'):
        return d.year
    return 0

expenses_by_year = {2024: [], 2025: [], 2026: []}

for o in vendor_orders:
    yr = get_year_from_date(o['orderDate'])
    if yr in expenses_by_year:
        expenses_by_year[yr].append({
            'date': o['orderDate'].strftime('%Y-%m-%d') if o['orderDate'] else '',
            'type': 'Vendor Order',
            'vendor_or_recipient': o['vendor'] or '',
            'description': (o['items'] or '')[:100],
            'category': o['expenseCategory'] or '',
            'amount': float(o['totalAmount'] or 0),
            'property': prop_display_map.get(o['propertyAttribution'], o['propertyAttribution'] or ''),
            'reference': o['orderNumber'] or '',
            'platform': o['vendor'] or '',
        })

for p in contractor_payments:
    yr = get_year_from_date(p['paymentDate'])
    if yr in expenses_by_year:
        expenses_by_year[yr].append({
            'date': p['paymentDate'].strftime('%Y-%m-%d') if p['paymentDate'] else '',
            'type': 'Contractor Payment',
            'vendor_or_recipient': p['recipientName'] or '',
            'description': p['note'] or '',
            'category': p['expenseCategory'] or '',
            'amount': float(p['amount'] or 0),
            'property': prop_display_map.get(p['propertyAttribution'], p['propertyAttribution'] or ''),
            'reference': '',
            'platform': p['platform'] or '',
        })

# Add corrected commissions
for yr in [2024, 2025, 2026]:
    for c in commissions_by_year.get(yr, []):
        expenses_by_year[yr].append(c)
    expenses_by_year[yr].sort(key=lambda x: x['date'])

# Write each year's expense detail sheet
HEADER = ['Date', 'Type', 'Vendor/Recipient', 'Description', 'Category', 'Amount (USD)', 'Property', 'Reference', 'Payment Platform']

for year in [2024, 2025, 2026]:
    sheet_title = f"{year} Expenses (Detail)"
    items = expenses_by_year[year]
    
    rows = [HEADER]
    for item in items:
        rows.append([
            item['date'], item['type'], item['vendor_or_recipient'],
            item['description'], item['category'], f"${item['amount']:,.2f}",
            item['property'], item['reference'], item['platform'],
        ])
    
    # Totals
    total = sum(i['amount'] for i in items)
    rows.append([])
    rows.append(['', '', '', '', 'TOTAL', f"${total:,.2f}", '', '', ''])
    
    # Property subtotals
    by_prop = defaultdict(float)
    for i in items:
        by_prop[i['property']] += i['amount']
    rows.append([])
    rows.append(['', '', '', '', '--- BY PROPERTY ---', '', '', '', ''])
    for prop, amt in sorted(by_prop.items(), key=lambda x: -x[1]):
        if prop:
            rows.append(['', '', '', '', prop, f"${amt:,.2f}", '', '', ''])
    
    # Category subtotals
    by_cat = defaultdict(float)
    for i in items:
        by_cat[i['category'] or 'uncategorized'] += i['amount']
    rows.append([])
    rows.append(['', '', '', '', '--- BY CATEGORY ---', '', '', '', ''])
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        rows.append(['', '', '', '', cat, f"${amt:,.2f}", '', '', ''])
    
    # Clear and write
    sheets_service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range=f"'{sheet_title}'!A:Z"
    ).execute()
    sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range=f"'{sheet_title}'!A1",
        valueInputOption='USER_ENTERED', body={'values': rows}
    ).execute()
    print(f"  Written '{sheet_title}': {len(items)} items, total ${total:,.2f}")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Update Summary Dashboard with corrected figures
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("STEP 4: Update Summary Dashboard")
print("=" * 60)

# Corrected income figures
# 2024 and 2026 were already correct
income = {
    2024: {'gross': 30059.56, 'net': 24497.27, 'bookings': 44},
    2025: {'gross': corrected_2025_gross, 'net': corrected_2025_net, 'bookings': len(filtered_rows)-1},
    2026: {'gross': 28875.40, 'net': 23850.25, 'bookings': 52},
}

# Corrected expense figures
expense_totals = {}
for yr in [2024, 2025, 2026]:
    expense_totals[yr] = sum(i['amount'] for i in expenses_by_year[yr])

# Property-level income (corrected)
cursor.execute("""
    SELECT pb.checkIn, pb.totalPrice, pb.netAmount, p.name as propertyName
    FROM property_bookings pb
    LEFT JOIN property_platforms pp ON pb.platformId = pp.id
    LEFT JOIN properties p ON pp.propertyId = p.id
    WHERE pb.bookingStatus = 'confirmed'
""")
confirmed_all = cursor.fetchall()

prop_income = defaultdict(lambda: defaultdict(lambda: {'gross': 0, 'net': 0, 'count': 0}))
for b in confirmed_all:
    yr = ms_to_year(b['checkIn'])
    if yr < 2024 or yr > 2026:
        continue
    prop = b['propertyName'] or 'Unknown'
    prop_income[yr][prop]['gross'] += float(b['totalPrice'] or 0)
    prop_income[yr][prop]['net'] += float(b['netAmount'] or 0)
    prop_income[yr][prop]['count'] += 1

# Build dashboard
dashboard = [
    ['Metric', '2024', '2025', '2026 YTD'],
    ['Total Bookings', str(income[2024]['bookings']), str(income[2025]['bookings']), str(income[2026]['bookings'])],
    ['Total Gross Revenue (USD)', f"${income[2024]['gross']:,.2f}", f"${income[2025]['gross']:,.2f}", f"${income[2026]['gross']:,.2f}"],
    ['Total Net Payout (USD)', f"${income[2024]['net']:,.2f}", f"${income[2025]['net']:,.2f}", f"${income[2026]['net']:,.2f}"],
    [],
    ['--- By Property ---'],
]

properties = ['Morabeza', 'Sunset Studio', "The Artiste's Boutique"]
for prop in properties:
    for yr in [2024, 2025, 2026]:
        pass  # just building rows below
    
    bookings_row = [f"{prop} - Bookings"]
    gross_row = [f"{prop} - Gross"]
    net_row = [f"{prop} - Net"]
    for yr in [2024, 2025, 2026]:
        d = prop_income[yr].get(prop, {'gross': 0, 'net': 0, 'count': 0})
        bookings_row.append(str(d['count']))
        gross_row.append(f"${d['gross']:,.2f}")
        net_row.append(f"${d['net']:,.2f}")
    dashboard.append(bookings_row)
    dashboard.append(gross_row)
    dashboard.append(net_row)

# Expenses section
dashboard.append([])
dashboard.append(['--- EXPENSES (Tax Deductible) ---'])
dashboard.append(['Metric', '2024', '2025', '2026 YTD'])
dashboard.append(['Total Property Expenses (USD)', f"${expense_totals[2024]:,.2f}", f"${expense_totals[2025]:,.2f}", f"${expense_totals[2026]:,.2f}"])
dashboard.append([])
dashboard.append(['--- Expenses By Property ---'])

# Expense property subtotals
for yr_data in [2024, 2025, 2026]:
    pass
exp_props = ['Morabeza', 'Sunset Studio', "Artiste's Boutique", 'Sunset Studio + Morabeza']
for prop in exp_props:
    row = [f"{prop} - Expenses"]
    for yr in [2024, 2025, 2026]:
        total = sum(i['amount'] for i in expenses_by_year[yr] if i['property'] == prop)
        row.append(f"${total:,.2f}")
    dashboard.append(row)

# Expense category subtotals
dashboard.append([])
dashboard.append(['--- Expenses By Category ---'])
all_categories = set()
for yr in expenses_by_year:
    for i in expenses_by_year[yr]:
        all_categories.add(i['category'] or 'uncategorized')

for cat in sorted(all_categories):
    row = [cat.replace('_', ' ').title()]
    for yr in [2024, 2025, 2026]:
        total = sum(i['amount'] for i in expenses_by_year[yr] if (i['category'] or 'uncategorized') == cat)
        row.append(f"${total:,.2f}" if total > 0 else '$0.00')
    dashboard.append(row)

# Net profit
dashboard.append([])
dashboard.append(['--- NET PROFIT (Income - Expenses) ---'])
net_profit_row = ['Net Profit (Net Payout - Expenses)']
for yr in [2024, 2025, 2026]:
    net = income[yr]['net'] - expense_totals[yr]
    net_profit_row.append(f"${net:,.2f}")
dashboard.append(net_profit_row)

# Write dashboard
sheets_service.spreadsheets().values().clear(
    spreadsheetId=SPREADSHEET_ID, range="'Summary Dashboard'!A:Z"
).execute()
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID, range="'Summary Dashboard'!A1",
    valueInputOption='USER_ENTERED', body={'values': dashboard}
).execute()

print(f"  Dashboard updated successfully")
print(f"\n  CORRECTED INCOME:")
for yr in [2024, 2025, 2026]:
    print(f"    {yr}: {income[yr]['bookings']} bookings, Gross ${income[yr]['gross']:,.2f}, Net ${income[yr]['net']:,.2f}")
print(f"\n  CORRECTED EXPENSES (incl. commissions):")
for yr in [2024, 2025, 2026]:
    print(f"    {yr}: ${expense_totals[yr]:,.2f}")
print(f"\n  NET PROFIT:")
for yr in [2024, 2025, 2026]:
    net = income[yr]['net'] - expense_totals[yr]
    print(f"    {yr}: ${net:,.2f}")

conn.close()
print(f"\n✅ All corrections applied!")
print(f"   URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
