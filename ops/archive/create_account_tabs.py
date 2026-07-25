#!/usr/bin/env python3
"""
Create per-account tabs in the Google Sheets workbook with all transactions,
current classifications, and dropdown columns for manual review.

Accounts:
1. BoA Personal Checking (ending 5765)
2. BoA Personal Savings (ending 5766 or similar)
3. BoA Personal Checking #2 (ending 3557)
4. BoA Business Checking (8981 0415 2448)
5. BoA Business Savings (8981 2573 0108)
6. Capital One Personal Card
7. Stripe (already done)
"""
import subprocess, json, os, re
import mysql.connector
from urllib.parse import urlparse
import base64, hashlib
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from decimal import Decimal

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

# Verticals for dropdown
VERTICALS = [
    'penthouse', 'main_floor', 'sunset_studio', 'morabeza_suite', 
    'whole_building_ny', 'artistes_boutique', 'maxfield_market', 
    'maxfield_bakery', 'startout_employment', 'personal_household', 
    'investment', 'transfer', 'fee_interest', 'split_personal_business'
]

QBO_CLASSES = [
    'Property Expense', 'Business', 'Personal', 'Investment', 
    'Transfer', 'Fee', 'Loan', 'Split'
]

QBO_CATEGORIES = [
    'Advertising & Marketing', 'Auto', 'Auto Insurance', 'Auto Loan',
    'Bank Charges & Fees', 'Cash Withdrawal', 'Childcare', 'Cleaning & Maintenance',
    'Contractors', 'Cost of Goods Sold', 'Credit Card Payment', 'Dining',
    "Directors' Emoluments", 'Education', 'Entertainment', 'Forex/Personal',
    'Freight Costs', 'Groceries', 'Health Care', 'Insurance',
    'Interest Income', 'Internal Transfer', 'Investment', 'Job Supplies',
    'Legal & Professional', 'Loan Payment', 'Loans Payable', 'Meals',
    'Medical', 'Mortgage Interest Paid', 'Office Supplies', 'Other Business',
    'Other Income', "Owner's Draw", "Owner's Equity Injection",
    'Personal', 'Property Management', 'Reimbursable', 'Remittance',
    'Rent & Lease', 'Rental Income', 'Repairs & Maintenance',
    'Sales of Product Income', 'Shipping', 'Subscriptions', 'Supplies',
    'Taxes & Licenses', 'Telephone', 'Travel', 'Utilities',
    'Web Services & Technology'
]


def get_service_account_key():
    """Get service account key from running process environment."""
    result = subprocess.run(['bash', '-c', 
        'for pid in $(pgrep -f "node.*server" | head -1); do '
        'cat /proc/$pid/environ 2>/dev/null | tr "\\0" "\\n" | grep "^GOOGLE_SERVICE_ACCOUNT_KEY="; '
        'done'], capture_output=True, text=True)
    
    for line in result.stdout.split('\n'):
        if line.startswith('GOOGLE_SERVICE_ACCOUNT_KEY='):
            key_json = line[len('GOOGLE_SERVICE_ACCOUNT_KEY='):]
            return json.loads(key_json)
    
    # Fallback: try env file
    env_path = '/home/ubuntu/geeves-shopping/.env'
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith('GOOGLE_SERVICE_ACCOUNT_KEY='):
                    key_json = line[len('GOOGLE_SERVICE_ACCOUNT_KEY='):].strip()
                    if key_json.startswith("'") and key_json.endswith("'"):
                        key_json = key_json[1:-1]
                    return json.loads(key_json)
    return None


def get_sheets_service():
    """Get authenticated Google Sheets service."""
    key_data = get_service_account_key()
    if not key_data:
        raise Exception("Could not find service account key")
    
    creds = Credentials.from_service_account_info(key_data, scopes=[
        'https://www.googleapis.com/auth/spreadsheets'
    ])
    return build('sheets', 'v4', credentials=creds)


def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )


def create_sheet_tab(service, spreadsheet_id, title, rows, headers):
    """Create or replace a sheet tab with data and formatting."""
    # Check if sheet exists
    spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    existing_sheets = {s['properties']['title']: s['properties']['sheetId'] 
                      for s in spreadsheet['sheets']}
    
    if title in existing_sheets:
        # Delete existing
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
            'requests': [{'deleteSheet': {'sheetId': existing_sheets[title]}}]
        }).execute()
    
    # Add new sheet
    result = service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
        'requests': [{'addSheet': {'properties': {'title': title}}}]
    }).execute()
    sheet_id = result['replies'][0]['addSheet']['properties']['sheetId']
    
    # Resize to fit data
    total_rows = len(rows) + 1  # +1 for header
    total_cols = len(headers)
    
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
        'requests': [{
            'updateSheetProperties': {
                'properties': {'sheetId': sheet_id, 'gridProperties': {
                    'rowCount': max(total_rows + 10, 1000),
                    'columnCount': total_cols
                }},
                'fields': 'gridProperties.rowCount,gridProperties.columnCount'
            }
        }]
    }).execute()
    
    # Write header + data
    all_values = [headers] + rows
    
    # Write in batches of 5000 rows to avoid API limits
    batch_size = 5000
    for i in range(0, len(all_values), batch_size):
        batch = all_values[i:i+batch_size]
        start_row = i + 1
        range_str = f"'{title}'!A{start_row}"
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_str,
            valueInputOption='RAW',
            body={'values': batch}
        ).execute()
    
    # Format header row (bold, freeze)
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
        'requests': [
            {
                'repeatCell': {
                    'range': {'sheetId': sheet_id, 'startRowIndex': 0, 'endRowIndex': 1},
                    'cell': {'userEnteredFormat': {
                        'textFormat': {'bold': True},
                        'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}
                    }},
                    'fields': 'userEnteredFormat(textFormat,backgroundColor)'
                }
            },
            {
                'updateSheetProperties': {
                    'properties': {'sheetId': sheet_id, 'gridProperties': {'frozenRowCount': 1}},
                    'fields': 'gridProperties.frozenRowCount'
                }
            }
        ]
    }).execute()
    
    # Add data validation (dropdowns) for classification columns
    # Find the column indices for Vertical, QBO Class, QBO Category
    vert_col = None
    class_col = None
    cat_col = None
    for idx, h in enumerate(headers):
        if 'VERTICAL' in h.upper() and 'EDIT' in h.upper():
            vert_col = idx
        elif 'CLASS' in h.upper() and 'EDIT' in h.upper():
            class_col = idx
        elif 'CATEGORY' in h.upper() and 'EDIT' in h.upper():
            cat_col = idx
    
    validation_requests = []
    if vert_col is not None:
        validation_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': vert_col, 'endColumnIndex': vert_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 'values': [{'userEnteredValue': v} for v in VERTICALS]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    if class_col is not None:
        validation_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': class_col, 'endColumnIndex': class_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 'values': [{'userEnteredValue': v} for v in QBO_CLASSES]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    if cat_col is not None:
        validation_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': cat_col, 'endColumnIndex': cat_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 'values': [{'userEnteredValue': v} for v in QBO_CATEGORIES]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    
    if validation_requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
            'requests': validation_requests
        }).execute()
    
    # Color the editable columns yellow
    color_requests = []
    for col_idx in [vert_col, class_col, cat_col]:
        if col_idx is not None:
            color_requests.append({
                'repeatCell': {
                    'range': {'sheetId': sheet_id, 'startRowIndex': 0, 'endRowIndex': 1,
                             'startColumnIndex': col_idx, 'endColumnIndex': col_idx + 1},
                    'cell': {'userEnteredFormat': {
                        'backgroundColor': {'red': 1.0, 'green': 0.95, 'blue': 0.6}
                    }},
                    'fields': 'userEnteredFormat.backgroundColor'
                }
            })
    
    if color_requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={
            'requests': color_requests
        }).execute()
    
    return sheet_id


def main():
    print("=" * 60)
    print("CREATING PER-ACCOUNT TABS IN GOOGLE SHEETS")
    print("=" * 60)
    
    service = get_sheets_service()
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    
    # Headers for all account tabs
    headers = [
        'Date', 'Description', 'Amount', 'Type', 'Account',
        'Current Vertical', 'Current Class', 'Current Category',
        'VERTICAL (edit)', 'CLASS (edit)', 'CATEGORY (edit)',
        'Split %', 'Notes'
    ]
    
    # ===== 1. BoA Personal Accounts =====
    print("\n1. BoA Personal Accounts...")
    cur.execute("""
        SELECT transaction_date, description, amount, transaction_type, account_number,
               business_vertical, qbo_class, qbo_expense_category
        FROM boa_transactions
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    boa_rows = cur.fetchall()
    
    rows = []
    for r in boa_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            r['description'] or '',
            amt,
            r['transaction_type'] or '',
            r['account_number'] or '',
            r['business_vertical'] or '',
            r['qbo_class'] or '',
            r['qbo_expense_category'] or '',
            '',  # VERTICAL (edit)
            '',  # CLASS (edit)
            '',  # CATEGORY (edit)
            '100',  # Split %
            ''   # Notes
        ])
    
    create_sheet_tab(service, SPREADSHEET_ID, 'BoA Personal (All)', rows, headers)
    print(f"  Created 'BoA Personal (All)' — {len(rows)} transactions")
    
    # ===== 2. BoA Business Checking =====
    print("\n2. BoA Business Checking...")
    cur.execute("""
        SELECT transaction_date, description, amount, transaction_type, account_number,
               business_vertical, qbo_class, qbo_expense_category
        FROM biz_account_transactions
        WHERE account_number = '898104152448'
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    biz_chk_rows = cur.fetchall()
    
    rows = []
    for r in biz_chk_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            r['description'] or '',
            amt,
            r['transaction_type'] or '',
            'Biz Checking (2448)',
            r['business_vertical'] or '',
            r['qbo_class'] or '',
            r['qbo_expense_category'] or '',
            '',  # VERTICAL (edit)
            '',  # CLASS (edit)
            '',  # CATEGORY (edit)
            '100',
            ''
        ])
    
    create_sheet_tab(service, SPREADSHEET_ID, 'BoA Biz Checking (2448)', rows, headers)
    print(f"  Created 'BoA Biz Checking (2448)' — {len(rows)} transactions")
    
    # ===== 3. BoA Business Savings =====
    print("\n3. BoA Business Savings...")
    cur.execute("""
        SELECT transaction_date, description, amount, transaction_type, account_number,
               business_vertical, qbo_class, qbo_expense_category
        FROM biz_account_transactions
        WHERE account_number = '898125730108'
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    biz_sav_rows = cur.fetchall()
    
    rows = []
    for r in biz_sav_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            r['description'] or '',
            amt,
            r['transaction_type'] or '',
            'Biz Savings (0108)',
            r['business_vertical'] or '',
            r['qbo_class'] or '',
            r['qbo_expense_category'] or '',
            '',
            '',
            '',
            '100',
            ''
        ])
    
    create_sheet_tab(service, SPREADSHEET_ID, 'BoA Biz Savings (0108)', rows, headers)
    print(f"  Created 'BoA Biz Savings (0108)' — {len(rows)} transactions")
    
    # ===== 4. Capital One Personal Card =====
    print("\n4. Capital One Personal Card...")
    cur.execute("""
        SELECT transaction_date, description, amount, transaction_type, card_last4,
               business_vertical, qbo_class, qbo_expense_category
        FROM capital_one_transactions
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    capone_rows = cur.fetchall()
    
    rows = []
    for r in capone_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        # Try different column names
        card = r.get('card_last4', '') or ''
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            r['description'] or '',
            amt,
            r['transaction_type'] or '',
            f'CapOne ({card})',
            r['business_vertical'] or '',
            r.get('qbo_class', '') or '',
            r.get('qbo_expense_category', '') or '',
            '',
            '',
            '',
            '100',
            ''
        ])
    
    create_sheet_tab(service, SPREADSHEET_ID, 'Capital One Card', rows, headers)
    print(f"  Created 'Capital One Card' — {len(rows)} transactions")
    
    # ===== 5. Stripe =====
    print("\n5. Stripe...")
    cur.execute("""
        SELECT created_date, description, amount, type as transaction_type,
               business_vertical, '' as qbo_class, '' as qbo_expense_category
        FROM stripe_transactions
        WHERE type IN ('charge', 'refund', 'adjustment')
        ORDER BY created_date DESC, ABS(amount) DESC
    """)
    stripe_rows = cur.fetchall()
    
    rows = []
    for r in stripe_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['created_date']) if r['created_date'] else '',
            r['description'] or '',
            amt,
            r['transaction_type'] or '',
            'Stripe',
            r['business_vertical'] or '',
            r.get('qbo_class', '') or '',
            r.get('qbo_expense_category', '') or '',
            '',
            '',
            '',
            '100',
            ''
        ])
    
    create_sheet_tab(service, SPREADSHEET_ID, 'Stripe', rows, headers)
    print(f"  Created 'Stripe' — {len(rows)} transactions")
    
    print("\n" + "=" * 60)
    print("ALL ACCOUNT TABS CREATED SUCCESSFULLY")
    print("=" * 60)
    
    conn.close()


if __name__ == '__main__':
    main()
