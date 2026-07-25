#!/usr/bin/env python3
"""
Create per-account tabs in the Google Sheets workbook with all transactions,
current classifications, and dropdown columns for manual review.
Uses OAuth token for Sheets API access.
"""
import json, os, time
import mysql.connector
from urllib.parse import urlparse
from decimal import Decimal
import requests

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

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


def get_access_token():
    """Get a fresh access token using stored credentials."""
    with open('/home/ubuntu/tax_prep/.google_creds.json') as f:
        creds = json.load(f)
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': creds['client_id'],
        'client_secret': creds['client_secret'],
        'refresh_token': creds['refresh_token'],
        'grant_type': 'refresh_token',
    })
    if resp.status_code == 200:
        return resp.json()['access_token']
    raise Exception(f"Token refresh failed: {resp.text}")


def sheets_api(method, endpoint, token, body=None, params=None):
    """Make a Sheets API request."""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}{endpoint}"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if method == 'GET':
        resp = requests.get(url, headers=headers, params=params)
    elif method == 'POST':
        resp = requests.post(url, headers=headers, json=body)
    elif method == 'PUT':
        resp = requests.put(url, headers=headers, json=body, params=params)
    if resp.status_code >= 400:
        raise Exception(f"API error {resp.status_code}: {resp.text[:300]}")
    return resp.json() if resp.text else {}


def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )


def create_tab(token, title, headers, rows):
    """Create or replace a tab with data and dropdowns."""
    # Get existing sheets
    info = sheets_api('GET', '', token, params={'fields': 'sheets.properties'})
    existing = {s['properties']['title']: s['properties']['sheetId'] for s in info['sheets']}
    
    # Delete if exists
    if title in existing:
        sheets_api('POST', ':batchUpdate', token, body={
            'requests': [{'deleteSheet': {'sheetId': existing[title]}}]
        })
        time.sleep(0.5)
    
    # Add new sheet
    result = sheets_api('POST', ':batchUpdate', token, body={
        'requests': [{'addSheet': {'properties': {'title': title}}}]
    })
    sheet_id = result['replies'][0]['addSheet']['properties']['sheetId']
    time.sleep(0.3)
    
    # Resize
    total_rows = len(rows) + 1
    sheets_api('POST', ':batchUpdate', token, body={
        'requests': [{
            'updateSheetProperties': {
                'properties': {'sheetId': sheet_id, 'gridProperties': {
                    'rowCount': max(total_rows + 10, 100),
                    'columnCount': len(headers)
                }},
                'fields': 'gridProperties.rowCount,gridProperties.columnCount'
            }
        }]
    })
    time.sleep(0.3)
    
    # Write data in batches
    all_values = [headers] + rows
    batch_size = 3000
    for i in range(0, len(all_values), batch_size):
        batch = all_values[i:i+batch_size]
        start_row = i + 1
        range_str = f"'{title}'!A{start_row}"
        sheets_api('PUT', f"/values/{requests.utils.quote(range_str)}", token, 
                  body={'values': batch}, params={'valueInputOption': 'RAW'})
        time.sleep(0.5)
    
    # Format header + freeze + dropdowns
    format_requests = [
        # Bold header
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
        # Freeze header
        {
            'updateSheetProperties': {
                'properties': {'sheetId': sheet_id, 'gridProperties': {'frozenRowCount': 1}},
                'fields': 'gridProperties.frozenRowCount'
            }
        }
    ]
    
    # Find editable columns
    vert_col = headers.index('VERTICAL (edit)') if 'VERTICAL (edit)' in headers else None
    class_col = headers.index('CLASS (edit)') if 'CLASS (edit)' in headers else None
    cat_col = headers.index('CATEGORY (edit)') if 'CATEGORY (edit)' in headers else None
    
    # Add dropdowns
    if vert_col is not None:
        format_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': vert_col, 'endColumnIndex': vert_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 
                                 'values': [{'userEnteredValue': v} for v in VERTICALS]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    if class_col is not None:
        format_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': class_col, 'endColumnIndex': class_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 
                                 'values': [{'userEnteredValue': v} for v in QBO_CLASSES]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    if cat_col is not None:
        format_requests.append({
            'setDataValidation': {
                'range': {'sheetId': sheet_id, 'startRowIndex': 1, 'endRowIndex': total_rows,
                         'startColumnIndex': cat_col, 'endColumnIndex': cat_col + 1},
                'rule': {
                    'condition': {'type': 'ONE_OF_LIST', 
                                 'values': [{'userEnteredValue': v} for v in QBO_CATEGORIES]},
                    'showCustomUi': True, 'strict': False
                }
            }
        })
    
    # Yellow highlight for editable columns
    for col_idx in [vert_col, class_col, cat_col]:
        if col_idx is not None:
            format_requests.append({
                'repeatCell': {
                    'range': {'sheetId': sheet_id, 'startRowIndex': 0, 'endRowIndex': 1,
                             'startColumnIndex': col_idx, 'endColumnIndex': col_idx + 1},
                    'cell': {'userEnteredFormat': {
                        'backgroundColor': {'red': 1.0, 'green': 0.95, 'blue': 0.6}
                    }},
                    'fields': 'userEnteredFormat.backgroundColor'
                }
            })
    
    sheets_api('POST', ':batchUpdate', token, body={'requests': format_requests})
    return sheet_id


def main():
    print("=" * 60)
    print("CREATING PER-ACCOUNT TABS IN GOOGLE SHEETS")
    print("=" * 60)
    
    token = get_access_token()
    print(f"Got access token (length: {len(token)})")
    
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    
    headers = [
        'Date', 'Description', 'Amount', 'Type', 'Account',
        'Current Vertical', 'Current Class', 'Current Category',
        'VERTICAL (edit)', 'CLASS (edit)', 'CATEGORY (edit)',
        'Split %', 'Notes'
    ]
    
    # ===== 1. BoA Personal Accounts =====
    print("\n1. BoA Personal Accounts...")
    cur.execute("""
        SELECT transaction_date, description, amount, account_type, account_number,
               vertical, category, qbo_category
        FROM boa_transactions
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    boa_rows = cur.fetchall()
    
    rows = []
    for r in boa_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            (r['description'] or '')[:200],
            amt,
            r['account_type'] or '',
            r['account_number'] or '',
            r['vertical'] or '',
            r['category'] or '',
            r['qbo_category'] or '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'BoA Personal (All)', headers, rows)
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
            (r['description'] or '')[:200],
            amt,
            r['transaction_type'] or '',
            'Biz Checking (2448)',
            r['business_vertical'] or '',
            r['qbo_class'] or '',
            r['qbo_expense_category'] or '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'BoA Biz Checking', headers, rows)
    print(f"  Created 'BoA Biz Checking' — {len(rows)} transactions")
    
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
            (r['description'] or '')[:200],
            amt,
            r['transaction_type'] or '',
            'Biz Savings (0108)',
            r['business_vertical'] or '',
            r['qbo_class'] or '',
            r['qbo_expense_category'] or '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'BoA Biz Savings', headers, rows)
    print(f"  Created 'BoA Biz Savings' — {len(rows)} transactions")
    
    # ===== 4. Capital One Personal Card =====
    print("\n4. Capital One Personal Card...")
    cur.execute("""
        SELECT transaction_date, description, amount, capital_one_category, card_number,
               business_vertical, qbo_class, qbo_expense_category
        FROM capital_one_transactions
        ORDER BY transaction_date DESC, ABS(amount) DESC
    """)
    capone_rows = cur.fetchall()
    
    rows = []
    for r in capone_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        card = r.get('card_number', '') or ''
        rows.append([
            str(r['transaction_date']) if r['transaction_date'] else '',
            (r['description'] or '')[:200],
            amt,
            r['capital_one_category'] or '',
            f'CapOne ({card[-4:] if card else ""})',
            r['business_vertical'] or '',
            r.get('qbo_class', '') or '',
            r.get('qbo_expense_category', '') or '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'Capital One Card (All)', headers, rows)
    print(f"  Created 'Capital One Card (All)' — {len(rows)} transactions")
    
    # ===== 5. Stripe =====
    print("\n5. Stripe...")
    cur.execute("""
        SELECT created_at, description, amount, type,
               business_vertical, fee
        FROM stripe_transactions
        WHERE type IN ('charge', 'refund', 'adjustment')
        ORDER BY created_at DESC, ABS(amount) DESC
    """)
    stripe_rows = cur.fetchall()
    
    rows = []
    for r in stripe_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        fee = float(r['fee']) if isinstance(r['fee'], Decimal) else (r['fee'] or 0)
        rows.append([
            str(r['created_at']) if r['created_at'] else '',
            (r['description'] or '')[:200],
            amt,
            r['type'] or '',
            f'Stripe (fee: ${fee:.2f})',
            r['business_vertical'] or '',
            '', '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'Stripe (All)', headers, rows)
    print(f"  Created 'Stripe (All)' — {len(rows)} transactions")
    
    # ===== 6. Zelle Payments (from contractor_payments table) =====
    print("\n6. Zelle Payments...")
    cur.execute("""
        SELECT paymentDate, recipientName, amount, 
               propertyAttribution, expenseCategory
        FROM contractor_payments
        ORDER BY paymentDate DESC, amount DESC
    """)
    zelle_rows = cur.fetchall()
    
    rows = []
    for r in zelle_rows:
        amt = float(r['amount']) if isinstance(r['amount'], Decimal) else (r['amount'] or 0)
        rows.append([
            str(r['paymentDate']) if r['paymentDate'] else '',
            r['recipientName'] or '',
            amt,
            'Zelle',
            'Personal BoA',
            r['propertyAttribution'] or '',
            '',
            r['expenseCategory'] or '',
            '', '', '', '100', ''
        ])
    
    create_tab(token, 'Zelle Payments', headers, rows)
    print(f"  Created 'Zelle Payments' — {len(rows)} transactions")
    
    print("\n" + "=" * 60)
    print("ALL ACCOUNT TABS CREATED SUCCESSFULLY!")
    print("=" * 60)
    
    conn.close()


if __name__ == '__main__':
    main()
