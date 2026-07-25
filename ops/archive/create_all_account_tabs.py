"""
Create per-account tabs in Google Sheets workbook with all transactions,
current classifications, and dropdown columns for manual review/override.

Accounts:
1. Capital One (Personal Card) - 2024-2026
2. BoA Personal Checking (ending 2448)
3. BoA Personal Savings (ending 0108 or similar)
4. Biz Checking (Maxfield Market)
5. Biz Savings (Maxfield Market)
6. Stripe

Each tab has:
- All transactions with date, description, amount, current classification
- Yellow dropdown columns for: Vertical, Split %, QBO Category
- Sorted by date descending
"""
import json, requests, mysql.connector, time
from urllib.parse import urlparse

# ─── Config ───────────────────────────────────────────────────────────────────
SPREADSHEET_ID = "1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI"
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

# Verticals (unit-based)
VERTICALS = [
    "penthouse", "main_floor", "sunset_studio", "morabeza_suite",
    "whole_building_ny", "artistes_boutique",
    "maxfield_market", "maxfield_bakery",
    "startout_employment", "personal_household",
    "investment", "transfer", "fee_interest", "loan"
]

# Split percentages
SPLITS = [
    "100%", "50/50", "60/40", "40/60", "75/25", "25/75",
    "33/33/34", "Custom"
]

# QBO Categories (aligned with Maxfield Market COA + personal)
QBO_CATEGORIES = [
    # Business
    "Advertising & Marketing", "Auto & Transport", "Bank Fees & Charges",
    "Cleaning & Maintenance", "Commission & Fees", "Computer & Internet",
    "Construction & Renovation", "Consulting & Professional Fees",
    "Delivery & Shipping", "Dues & Subscriptions", "Education & Training",
    "Equipment & Supplies", "Freight & Logistics", "Insurance",
    "Interest Expense", "Legal & Professional", "Licenses & Permits",
    "Meals & Entertainment", "Mortgage Interest", "Office Supplies",
    "Payroll & Wages", "Property Tax", "Rent Expense",
    "Repairs & Maintenance", "Supplies", "Travel", "Utilities",
    # Personal
    "Childcare", "Clothing", "Dining Out", "Entertainment",
    "Gifts & Donations", "Groceries", "Health & Medical",
    "Home Improvement", "Household Supplies", "Investment Transfer",
    "Loan Payment", "Loan Received", "Owner's Draw", "Owner's Equity",
    "Personal Care", "Pet Care", "Phone & Internet", "Rent (Personal)",
    "Salary/Income", "Shopping", "Subscriptions (Personal)",
    "Vehicle Insurance", "Vehicle Payment"
]

# ─── Auth ─────────────────────────────────────────────────────────────────────
def get_access_token():
    with open('/home/ubuntu/tax_prep/.google_creds.json') as f:
        creds = json.load(f)
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': creds['client_id'],
        'client_secret': creds['client_secret'],
        'refresh_token': creds['refresh_token'],
        'grant_type': 'refresh_token',
    })
    return resp.json()['access_token']

def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )

# ─── Sheets Helpers ───────────────────────────────────────────────────────────
def batch_update(access_token, requests_body):
    resp = requests.post(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}:batchUpdate',
        headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
        json={'requests': requests_body}
    )
    if resp.status_code != 200:
        print(f"  batch_update error: {resp.text[:200]}")
    return resp

def values_update(access_token, range_str, values):
    """Write values to a range"""
    resp = requests.put(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{range_str}',
        headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
        params={'valueInputOption': 'RAW'},
        json={'range': range_str, 'majorDimension': 'ROWS', 'values': values}
    )
    if resp.status_code != 200:
        print(f"  values_update error for {range_str}: {resp.text[:200]}")
    return resp

def get_existing_sheets(access_token):
    resp = requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}',
        headers={'Authorization': f'Bearer {access_token}'},
        params={'fields': 'sheets.properties'}
    )
    sheets = {}
    if resp.status_code == 200:
        for s in resp.json().get('sheets', []):
            props = s['properties']
            sheets[props['title']] = props['sheetId']
    return sheets

def create_or_clear_sheet(access_token, title, existing_sheets, row_count=1000):
    """Create sheet if not exists, or clear it if it does."""
    if title in existing_sheets:
        # Clear existing
        sheet_id = existing_sheets[title]
        batch_update(access_token, [{'updateCells': {
            'range': {'sheetId': sheet_id},
            'fields': 'userEnteredValue,userEnteredFormat'
        }}])
        # Resize
        batch_update(access_token, [{'updateSheetProperties': {
            'properties': {'sheetId': sheet_id, 'gridProperties': {'rowCount': max(row_count, 100), 'columnCount': 12}},
            'fields': 'gridProperties.rowCount,gridProperties.columnCount'
        }}])
        return sheet_id
    else:
        resp = batch_update(access_token, [{'addSheet': {'properties': {
            'title': title,
            'gridProperties': {'rowCount': max(row_count, 100), 'columnCount': 12}
        }}}])
        if resp.status_code == 200:
            return resp.json()['replies'][0]['addSheet']['properties']['sheetId']
        return None

def add_data_validation(access_token, sheet_id, col_index, values_list, start_row=1, end_row=5000):
    """Add dropdown validation to a column."""
    batch_update(access_token, [{'setDataValidation': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': start_row,
            'endRowIndex': end_row,
            'startColumnIndex': col_index,
            'endColumnIndex': col_index + 1,
        },
        'rule': {
            'condition': {
                'type': 'ONE_OF_LIST',
                'values': [{'userEnteredValue': v} for v in values_list[:500]]  # Sheets limit
            },
            'showCustomUi': True,
            'strict': False,
        }
    }}])

def format_header_and_dropdown_cols(access_token, sheet_id, num_cols, dropdown_cols):
    """Format header row bold and dropdown columns yellow."""
    reqs = []
    # Bold header
    reqs.append({'repeatCell': {
        'range': {'sheetId': sheet_id, 'startRowIndex': 0, 'endRowIndex': 1},
        'cell': {'userEnteredFormat': {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}}},
        'fields': 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor'
    }})
    # Yellow background for dropdown columns
    for col in dropdown_cols:
        reqs.append({'repeatCell': {
            'range': {'sheetId': sheet_id, 'startColumnIndex': col, 'endColumnIndex': col + 1, 'startRowIndex': 1, 'endRowIndex': 5000},
            'cell': {'userEnteredFormat': {'backgroundColor': {'red': 1.0, 'green': 0.98, 'blue': 0.8}}},
            'fields': 'userEnteredFormat.backgroundColor'
        }})
    # Freeze header
    reqs.append({'updateSheetProperties': {
        'properties': {'sheetId': sheet_id, 'gridProperties': {'frozenRowCount': 1}},
        'fields': 'gridProperties.frozenRowCount'
    }})
    batch_update(access_token, reqs)

# ─── Data Queries ─────────────────────────────────────────────────────────────
def get_capital_one_data(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT transaction_date, posted_date, description, capital_one_category, amount, 
               business_vertical, qbo_expense_category, year
        FROM capital_one_transactions 
        ORDER BY transaction_date DESC
    """)
    return cur.fetchall()

def get_boa_data(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT transaction_date, description, amount, account_number, account_type,
               vertical, category, qbo_category
        FROM boa_transactions 
        ORDER BY transaction_date DESC
    """)
    return cur.fetchall()

def get_biz_data(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT transaction_date, description, amount, transaction_type, account_type,
               business_vertical, qbo_expense_category
        FROM biz_account_transactions 
        ORDER BY transaction_date DESC
    """)
    return cur.fetchall()

def get_stripe_data(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT created_at, description, amount, fee, net, type as txn_type,
               business_vertical, sub_category
        FROM stripe_transactions 
        ORDER BY created_at DESC
    """)
    return cur.fetchall()

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    access_token = get_access_token()
    conn = get_db()
    existing_sheets = get_existing_sheets(access_token)
    
    print("Creating account tabs...")
    
    # ─── 1. Capital One ───────────────────────────────────────────────────────
    print("\n1. Capital One (Personal Card)...")
    cap_data = get_capital_one_data(conn)
    print(f"   {len(cap_data)} transactions")
    
    headers = ["Date", "Description", "Amount", "Category", "Year",
               "Current Vertical", "VERTICAL (edit)", "SPLIT % (edit)", "QBO CATEGORY (edit)"]
    rows = [headers]
    for t in cap_data:
        rows.append([
            str(t['transaction_date'] or t['posted_date'] or ''),
            str(t['description'] or ''),
            str(t['amount'] or ''),
            str(t['capital_one_category'] or ''),
            str(t['year'] or ''),
            str(t['business_vertical'] or ''),
            str(t['business_vertical'] or ''),  # Pre-fill editable with current
            '100%',
            str(t['qbo_expense_category'] or ''),
        ])
    
    sheet_id = create_or_clear_sheet(access_token, "Capital One", existing_sheets, len(rows) + 10)
    if sheet_id is not None:
        # Write in batches of 500
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            start_row = i + 1
            values_update(access_token, f"'Capital One'!A{start_row}", batch)
            time.sleep(0.5)
        
        # Add dropdowns
        add_data_validation(access_token, sheet_id, 6, VERTICALS, 1, len(rows))  # Col G
        add_data_validation(access_token, sheet_id, 7, SPLITS, 1, len(rows))     # Col H
        add_data_validation(access_token, sheet_id, 8, QBO_CATEGORIES, 1, len(rows))  # Col I
        format_header_and_dropdown_cols(access_token, sheet_id, 9, [6, 7, 8])
        existing_sheets["Capital One"] = sheet_id
        print(f"   Done! Sheet ID: {sheet_id}")
    
    # ─── 2. Bank of America ───────────────────────────────────────────────────
    print("\n2. Bank of America (Personal)...")
    boa_data = get_boa_data(conn)
    print(f"   {len(boa_data)} transactions")
    
    # Split by account
    boa_accounts = {}
    for t in boa_data:
        acct = str(t.get('account_number') or 'unknown')
        if acct not in boa_accounts:
            boa_accounts[acct] = []
        boa_accounts[acct].append(t)
    
    print(f"   Accounts found: {list(boa_accounts.keys())}")
    
    # Create one combined tab for BoA
    headers = ["Date", "Description", "Amount", "Account", "Type", "Category",
               "Current Vertical", "VERTICAL (edit)", "SPLIT % (edit)", "QBO CATEGORY (edit)"]
    rows = [headers]
    for t in boa_data:
        rows.append([
            str(t['transaction_date'] or ''),
            str(t['description'] or ''),
            str(t['amount'] or ''),
            str(t['account_number'] or ''),
            str(t['account_type'] or ''),
            str(t['category'] or ''),
            str(t['vertical'] or ''),
            str(t['vertical'] or ''),
            '100%',
            str(t['qbo_category'] or ''),
        ])
    
    sheet_id = create_or_clear_sheet(access_token, "BoA Personal", existing_sheets, len(rows) + 10)
    if sheet_id is not None:
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            start_row = i + 1
            values_update(access_token, f"'BoA Personal'!A{start_row}", batch)
            time.sleep(0.5)
        
        add_data_validation(access_token, sheet_id, 7, VERTICALS, 1, len(rows))  # Col H
        add_data_validation(access_token, sheet_id, 8, SPLITS, 1, len(rows))     # Col I
        add_data_validation(access_token, sheet_id, 9, QBO_CATEGORIES, 1, len(rows))  # Col J
        format_header_and_dropdown_cols(access_token, sheet_id, 10, [7, 8, 9])
        existing_sheets["BoA Personal"] = sheet_id
        print(f"   Done! Sheet ID: {sheet_id}")
    
    # ─── 3. Business Accounts ─────────────────────────────────────────────────
    print("\n3. Business Accounts (Maxfield Market)...")
    biz_data = get_biz_data(conn)
    print(f"   {len(biz_data)} transactions")
    
    headers = ["Date", "Description", "Amount", "Type", "Account",
               "Current Vertical", "VERTICAL (edit)", "SPLIT % (edit)", "QBO CATEGORY (edit)"]
    rows = [headers]
    for t in biz_data:
        rows.append([
            str(t['transaction_date'] or ''),
            str(t['description'] or ''),
            str(t['amount'] or ''),
            str(t['transaction_type'] or ''),
            str(t['account_type'] or ''),
            str(t['business_vertical'] or ''),
            str(t['business_vertical'] or ''),
            '100%',
            str(t['qbo_expense_category'] or ''),
        ])
    
    sheet_id = create_or_clear_sheet(access_token, "Biz Accounts", existing_sheets, len(rows) + 10)
    if sheet_id is not None:
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            start_row = i + 1
            values_update(access_token, f"'Biz Accounts'!A{start_row}", batch)
            time.sleep(0.5)
        
        add_data_validation(access_token, sheet_id, 7, VERTICALS, 1, len(rows))
        add_data_validation(access_token, sheet_id, 8, SPLITS, 1, len(rows))
        add_data_validation(access_token, sheet_id, 9, QBO_CATEGORIES, 1, len(rows))
        format_header_and_dropdown_cols(access_token, sheet_id, 10, [7, 8, 9])
        existing_sheets["Biz Accounts"] = sheet_id
        print(f"   Done! Sheet ID: {sheet_id}")
    
    # ─── 4. Stripe ────────────────────────────────────────────────────────────
    print("\n4. Stripe...")
    stripe_data = get_stripe_data(conn)
    print(f"   {len(stripe_data)} transactions")
    
    headers = ["Date", "Description", "Amount", "Fee", "Net", "Type",
               "Current Vertical", "VERTICAL (edit)", "QBO CATEGORY (edit)"]
    rows = [headers]
    for t in stripe_data:
        rows.append([
            str(t['created_at'] or ''),
            str(t['description'] or ''),
            str(t['amount'] or ''),
            str(t['fee'] or ''),
            str(t['net'] or ''),
            str(t['txn_type'] or ''),
            str(t['business_vertical'] or ''),
            str(t['business_vertical'] or ''),
            str(t['sub_category'] or ''),
        ])
    
    sheet_id = create_or_clear_sheet(access_token, "Stripe", existing_sheets, len(rows) + 10)
    if sheet_id is not None:
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            start_row = i + 1
            values_update(access_token, f"'Stripe'!A{start_row}", batch)
            time.sleep(0.5)
        
        add_data_validation(access_token, sheet_id, 8, VERTICALS, 1, len(rows))
        add_data_validation(access_token, sheet_id, 9, QBO_CATEGORIES, 1, len(rows))
        format_header_and_dropdown_cols(access_token, sheet_id, 10, [8, 9])
        existing_sheets["Stripe"] = sheet_id
        print(f"   Done! Sheet ID: {sheet_id}")
    
    # ─── 5. Update Dropdowns Reference Sheet ──────────────────────────────────
    print("\n5. Updating _Dropdowns reference sheet...")
    headers = ["Verticals", "Split %", "QBO Categories"]
    max_len = max(len(VERTICALS), len(SPLITS), len(QBO_CATEGORIES))
    rows = [headers]
    for i in range(max_len):
        rows.append([
            VERTICALS[i] if i < len(VERTICALS) else '',
            SPLITS[i] if i < len(SPLITS) else '',
            QBO_CATEGORIES[i] if i < len(QBO_CATEGORIES) else '',
        ])
    
    sheet_id = create_or_clear_sheet(access_token, "_Dropdowns", existing_sheets, len(rows) + 5)
    if sheet_id is not None:
        values_update(access_token, "'_Dropdowns'!A1", rows)
        existing_sheets["_Dropdowns"] = sheet_id
        print(f"   Done!")
    
    conn.close()
    print("\n✅ All account tabs created successfully!")
    print(f"   Workbook: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")

if __name__ == "__main__":
    main()
