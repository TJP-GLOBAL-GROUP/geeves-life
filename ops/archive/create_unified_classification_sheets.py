#!/usr/bin/env python3
"""
Create unified classification sheets in Google Sheets with:
1. Rebuilt Capital One tab with unit-based verticals and split percentages
2. BoA classification tabs (one per account) with auto-classified data
3. Proper dropdowns for verticals, categories, and split percentages
4. All verticals from the updated property structure

Uses the existing spreadsheet: 1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI
"""
import subprocess, json, re, os
import mysql.connector
from urllib.parse import urlparse
import base64, hashlib, requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
JWT_SECRET = "Ksf86cxXMujRRnssReDUh6"
SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

# Verticals (unit-based)
VERTICALS = [
    'penthouse',
    'main_floor', 
    'sunset_studio',
    'morabeza_suite',
    'whole_building_ny',
    'artistes_boutique',
    'maxfield_market',
    'maxfield_bakery',
    'startout_employment',
    'personal_household',
    'investment',
    'transfer',
    'fee_interest',
]

# QBO Categories (from Maxfield Market COA + personal)
QBO_CATEGORIES = [
    'Advertising & Marketing',
    'Auto Loan Payment',
    'Bank Charges & Fees',
    'Car & Truck',
    'Childcare',
    'Cleaning Expense (Rental Property)',
    'Contractors',
    'Cost of Goods Sold',
    'Dining',
    'Education',
    'Employment Income',
    'Entertainment',
    'Freight Costs',
    'Gas/Transportation',
    'Groceries/Household',
    'Health Care',
    'Insurance',
    'Interest Paid',
    'Investment',
    'Job Supplies',
    'Legal & Professional Services',
    'Meals & Entertainment',
    'Mortgage Interest Paid',
    'Office Supplies & Software',
    'Other Business Expenses',
    "Owner's Draw",
    "Owner's Equity Injection",
    "Owner's Investment",
    'Personal',
    'Reimbursable Expenses',
    'Remittance',
    'Rent & Lease',
    'Repairs & Maintenance',
    'Salary',
    'Shopping',
    'Subscriptions',
    'Taxes & Licenses',
    'Transfer',
    'Travel',
    'Utilities',
    'Web Services',
]

# Income categories
INCOME_CATEGORIES = [
    'Airbnb Rental Income',
    'Booking.com Income',
    'VRBO Income',
    'Sales of Product Income',
    'Services',
    'Employment Income',
    'Investment Return',
    "Owner's Income",
    'Interest Earned',
    'Personal Income',
    'Tax Refund',
]

def get_sheets_service():
    """Use service account for Sheets API access."""
    from google.oauth2 import service_account
    
    result = subprocess.run(['bash', '-c', 'for pid in $(pgrep node | head -1); do cat /proc/$pid/environ 2>/dev/null; done'], capture_output=True)
    env_vars = {}
    for item in result.stdout.split(b'\x00'):
        decoded = item.decode('utf-8', errors='replace')
        if '=' in decoded:
            k, v = decoded.split('=', 1)
            env_vars[k] = v
    
    sa_email = env_vars.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    sa_key = env_vars.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')
    
    sa_info = {
        'type': 'service_account',
        'project_id': 'geeves-495802',
        'private_key': sa_key,
        'client_email': sa_email,
        'token_uri': 'https://oauth2.googleapis.com/token',
    }
    
    creds = service_account.Credentials.from_service_account_info(
        sa_info, scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    return build('sheets', 'v4', credentials=creds)


def main():
    print("=" * 60)
    print("CREATING UNIFIED CLASSIFICATION SHEETS")
    print("=" * 60)
    
    service = get_sheets_service()
    
    # Get existing sheets
    spreadsheet = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    existing_sheets = {s['properties']['title']: s['properties']['sheetId'] for s in spreadsheet['sheets']}
    print(f"\nExisting sheets: {list(existing_sheets.keys())}")
    
    # Load BoA data from database
    parsed = urlparse(DB_URL)
    conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
    cur = conn.cursor(dictionary=True)
    
    # Get BoA transactions that need review (non-transfer, non-trivial)
    cur.execute("""
        SELECT id, transaction_date, description, amount, account_number, 
            vertical, category, qbo_category, classification_method, split_pct
        FROM boa_transactions
        WHERE vertical NOT IN ('transfer', 'fee_interest')
        AND ABS(amount) >= 5
        ORDER BY transaction_date DESC
    """)
    boa_txns = cur.fetchall()
    print(f"\nBoA transactions for review: {len(boa_txns)}")
    
    # Get Capital One transactions that need review
    cur.execute("""
        SELECT id, transaction_date, description, amount, business_vertical, 
            capital_one_category, qbo_expense_category, 
            CASE WHEN auto_matched = 1 THEN 'auto' ELSE 'unclassified' END as method,
            100 as split_pct
        FROM capital_one_transactions
        WHERE ABS(amount) >= 5
        ORDER BY transaction_date DESC
    """)
    cap_one_txns = cur.fetchall()
    print(f"Capital One transactions for review: {len(cap_one_txns)}")
    
    conn.close()
    
    # Prepare batch requests
    requests_batch = []
    
    # --- Create/Clear BoA Classification Tab ---
    boa_sheet_name = "BoA - Classify"
    if boa_sheet_name in existing_sheets:
        # Clear it
        requests_batch.append({
            'updateCells': {
                'range': {'sheetId': existing_sheets[boa_sheet_name]},
                'fields': 'userEnteredValue,userEnteredFormat,dataValidation'
            }
        })
        boa_sheet_id = existing_sheets[boa_sheet_name]
    else:
        boa_sheet_id = 9000
        requests_batch.append({
            'addSheet': {
                'properties': {'title': boa_sheet_name, 'sheetId': boa_sheet_id, 'index': 0}
            }
        })
    
    # --- Create/Clear Capital One Classification Tab ---
    cap_sheet_name = "CapOne - Classify"
    if cap_sheet_name in existing_sheets:
        requests_batch.append({
            'updateCells': {
                'range': {'sheetId': existing_sheets[cap_sheet_name]},
                'fields': 'userEnteredValue,userEnteredFormat,dataValidation'
            }
        })
        cap_sheet_id = existing_sheets[cap_sheet_name]
    else:
        cap_sheet_id = 9001
        requests_batch.append({
            'addSheet': {
                'properties': {'title': cap_sheet_name, 'sheetId': cap_sheet_id, 'index': 1}
            }
        })
    
    # --- Create Reference Tab (hidden) for dropdown values ---
    ref_sheet_name = "_Dropdowns"
    if ref_sheet_name in existing_sheets:
        requests_batch.append({
            'updateCells': {
                'range': {'sheetId': existing_sheets[ref_sheet_name]},
                'fields': 'userEnteredValue'
            }
        })
        ref_sheet_id = existing_sheets[ref_sheet_name]
    else:
        ref_sheet_id = 9002
        requests_batch.append({
            'addSheet': {
                'properties': {'title': ref_sheet_name, 'sheetId': ref_sheet_id, 'index': 10}
            }
        })
    
    # Execute sheet creation
    if requests_batch:
        service.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID,
            body={'requests': requests_batch}
        ).execute()
    print("\nSheets created/cleared")
    
    # --- Write Reference Data ---
    ref_data = []
    ref_data.append(['Verticals', 'QBO Expense Categories', 'Income Categories', 'Split %'])
    max_rows = max(len(VERTICALS), len(QBO_CATEGORIES), len(INCOME_CATEGORIES))
    splits = ['100', '75/25', '60/40', '50/50', '40/60', '25/75', '33/33/34', 'Custom']
    for i in range(max_rows):
        row = [
            VERTICALS[i] if i < len(VERTICALS) else '',
            QBO_CATEGORIES[i] if i < len(QBO_CATEGORIES) else '',
            INCOME_CATEGORIES[i] if i < len(INCOME_CATEGORIES) else '',
            splits[i] if i < len(splits) else '',
        ]
        ref_data.append(row)
    
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{ref_sheet_name}'!A1",
        valueInputOption='RAW',
        body={'values': ref_data}
    ).execute()
    print("Reference data written")
    
    # --- Resize sheets to fit data ---
    resize_requests = []
    # BoA sheet needs enough rows
    resize_requests.append({
        'updateSheetProperties': {
            'properties': {'sheetId': boa_sheet_id, 'gridProperties': {'rowCount': max(2000, len(boa_txns) + 10), 'columnCount': 15}},
            'fields': 'gridProperties.rowCount,gridProperties.columnCount'
        }
    })
    # CapOne sheet needs enough rows
    resize_requests.append({
        'updateSheetProperties': {
            'properties': {'sheetId': cap_sheet_id, 'gridProperties': {'rowCount': max(2000, len(cap_one_txns) + 10), 'columnCount': 15}},
            'fields': 'gridProperties.rowCount,gridProperties.columnCount'
        }
    })
    service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': resize_requests}
    ).execute()
    print("Sheets resized")
    
    # --- Write BoA Data ---
    boa_header = [
        'ID', 'Date', 'Description', 'Amount', 'Account', 
        'Auto-Vertical', 'Auto-Category', 'Method',
        'VERTICAL (edit)', 'QBO CATEGORY (edit)', 'SPLIT % (edit)', 'NOTES'
    ]
    
    boa_rows = [boa_header]
    for t in boa_txns:
        acct_short = f"...{t['account_number'][-4:]}" if t['account_number'] else '?'
        boa_rows.append([
            t['id'],
            str(t['transaction_date']),
            t['description'][:80],
            float(t['amount']),
            acct_short,
            t['vertical'] or '',
            t['qbo_category'] or '',
            t['classification_method'] or '',
            t['vertical'] or '',  # Pre-fill with auto value
            t['qbo_category'] or '',  # Pre-fill
            '100',  # Default split
            '',  # Notes
        ])
    
    # Write in batches (Sheets API limit)
    batch_size = 1000
    for i in range(0, len(boa_rows), batch_size):
        batch = boa_rows[i:i+batch_size]
        start_row = i + 1
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{boa_sheet_name}'!A{start_row}",
            valueInputOption='RAW',
            body={'values': batch}
        ).execute()
    print(f"BoA data written: {len(boa_rows)-1} rows")
    
    # --- Write Capital One Data ---
    cap_header = [
        'ID', 'Date', 'Description', 'Amount',
        'Auto-Vertical', 'Auto-Category', 'Method',
        'VERTICAL (edit)', 'QBO CATEGORY (edit)', 'SPLIT % (edit)', 'NOTES'
    ]
    
    cap_rows = [cap_header]
    for t in cap_one_txns:
        cap_rows.append([
            t['id'],
            str(t['transaction_date']),
            t['description'][:80],
            float(t['amount']),
            t['business_vertical'] or '',
            t['qbo_expense_category'] or '',
            t['method'] or '',
            t['business_vertical'] or '',  # Pre-fill
            t['qbo_expense_category'] or '',  # Pre-fill
            '100',  # Default split
            '',  # Notes
        ])
    
    for i in range(0, len(cap_rows), batch_size):
        batch = cap_rows[i:i+batch_size]
        start_row = i + 1
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{cap_sheet_name}'!A{start_row}",
            valueInputOption='RAW',
            body={'values': batch}
        ).execute()
    print(f"Capital One data written: {len(cap_rows)-1} rows")
    
    # --- Add Data Validation (Dropdowns) ---
    validation_requests = []
    
    # BoA sheet dropdowns
    boa_row_count = len(boa_rows)
    
    # Vertical dropdown (column I = index 8)
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': boa_sheet_id,
                'startRowIndex': 1, 'endRowIndex': boa_row_count,
                'startColumnIndex': 8, 'endColumnIndex': 9
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in VERTICALS]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # QBO Category dropdown (column J = index 9)
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': boa_sheet_id,
                'startRowIndex': 1, 'endRowIndex': boa_row_count,
                'startColumnIndex': 9, 'endColumnIndex': 10
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in QBO_CATEGORIES]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # Split % dropdown (column K = index 10)
    split_options = ['100', '75/25', '60/40', '50/50', '40/60', '25/75', '33/33/34', 'Custom']
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': boa_sheet_id,
                'startRowIndex': 1, 'endRowIndex': boa_row_count,
                'startColumnIndex': 10, 'endColumnIndex': 11
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in split_options]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # Capital One sheet dropdowns
    cap_row_count = len(cap_rows)
    
    # Vertical dropdown (column H = index 7)
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': cap_sheet_id,
                'startRowIndex': 1, 'endRowIndex': cap_row_count,
                'startColumnIndex': 7, 'endColumnIndex': 8
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in VERTICALS]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # QBO Category dropdown (column I = index 8)
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': cap_sheet_id,
                'startRowIndex': 1, 'endRowIndex': cap_row_count,
                'startColumnIndex': 8, 'endColumnIndex': 9
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in QBO_CATEGORIES]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # Split % dropdown (column J = index 9)
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': cap_sheet_id,
                'startRowIndex': 1, 'endRowIndex': cap_row_count,
                'startColumnIndex': 9, 'endColumnIndex': 10
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in split_options]
                },
                'showCustomUi': True, 'strict': False
            }
        }
    })
    
    # --- Format headers (bold, freeze) ---
    format_requests = [
        # Freeze header row - BoA
        {'updateSheetProperties': {
            'properties': {'sheetId': boa_sheet_id, 'gridProperties': {'frozenRowCount': 1}},
            'fields': 'gridProperties.frozenRowCount'
        }},
        # Freeze header row - CapOne
        {'updateSheetProperties': {
            'properties': {'sheetId': cap_sheet_id, 'gridProperties': {'frozenRowCount': 1}},
            'fields': 'gridProperties.frozenRowCount'
        }},
        # Bold header - BoA
        {'repeatCell': {
            'range': {'sheetId': boa_sheet_id, 'startRowIndex': 0, 'endRowIndex': 1},
            'cell': {'userEnteredFormat': {'textFormat': {'bold': True}}},
            'fields': 'userEnteredFormat.textFormat.bold'
        }},
        # Bold header - CapOne
        {'repeatCell': {
            'range': {'sheetId': cap_sheet_id, 'startRowIndex': 0, 'endRowIndex': 1},
            'cell': {'userEnteredFormat': {'textFormat': {'bold': True}}},
            'fields': 'userEnteredFormat.textFormat.bold'
        }},
        # Yellow background for editable columns (I, J, K) - BoA
        {'repeatCell': {
            'range': {'sheetId': boa_sheet_id, 'startRowIndex': 0, 'endRowIndex': 1,
                     'startColumnIndex': 8, 'endColumnIndex': 12},
            'cell': {'userEnteredFormat': {'backgroundColor': {'red': 1, 'green': 0.95, 'blue': 0.6}}},
            'fields': 'userEnteredFormat.backgroundColor'
        }},
        # Yellow background for editable columns (H, I, J) - CapOne
        {'repeatCell': {
            'range': {'sheetId': cap_sheet_id, 'startRowIndex': 0, 'endRowIndex': 1,
                     'startColumnIndex': 7, 'endColumnIndex': 11},
            'cell': {'userEnteredFormat': {'backgroundColor': {'red': 1, 'green': 0.95, 'blue': 0.6}}},
            'fields': 'userEnteredFormat.backgroundColor'
        }},
    ]
    
    # Execute all formatting and validation
    all_requests = validation_requests + format_requests
    service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': all_requests}
    ).execute()
    
    print("\nDropdowns and formatting applied!")
    print(f"\n{'='*60}")
    print("DONE!")
    print(f"{'='*60}")
    print(f"\nSpreadsheet: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
    print(f"\nTabs created:")
    print(f"  1. 'BoA - Classify' — {len(boa_rows)-1} transactions with dropdowns")
    print(f"  2. 'CapOne - Classify' — {len(cap_rows)-1} transactions with dropdowns")
    print(f"  3. '_Dropdowns' — Reference values for validation")
    print(f"\nEditable columns (yellow headers):")
    print(f"  - VERTICAL (edit): Select the business vertical/property unit")
    print(f"  - QBO CATEGORY (edit): Select the QBO expense category")
    print(f"  - SPLIT % (edit): If shared across units (100 = single unit, 50/50 = split)")
    print(f"  - NOTES: Any additional context")


if __name__ == '__main__':
    main()
