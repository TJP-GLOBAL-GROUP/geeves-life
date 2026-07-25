#!/usr/bin/env python3
"""
Create an interactive Google Sheet tab with:
1. All unclassified Capital One transactions
2. Dropdown columns for: Business Vertical, QBO Class, QBO Expense Category
3. Also a summary tab of all classified transactions for reference
"""
import mysql.connector
from urllib.parse import urlparse
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

# Load service account
with open('/home/ubuntu/tax_prep/sa_info.json', 'r') as f:
    sa_info = json.load(f)

creds = service_account.Credentials.from_service_account_info(sa_info, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets_service = build('sheets', 'v4', credentials=creds)

# --- Get unclassified transactions ---
parsed = urlparse(DB_URL)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
cursor = conn.cursor(dictionary=True)

# Get unclassified debits for manual review
cursor.execute("""
    SELECT id, transaction_date, description, amount, capital_one_category, card_number, year
    FROM capital_one_transactions
    WHERE business_vertical = 'unclassified' AND is_debit = TRUE
    ORDER BY amount DESC, transaction_date
""")
unclassified = cursor.fetchall()

# Get classified summary for reference
cursor.execute("""
    SELECT business_vertical, year,
           COUNT(*) as cnt, SUM(amount) as total,
           GROUP_CONCAT(DISTINCT qbo_expense_category SEPARATOR ', ') as categories
    FROM capital_one_transactions
    WHERE business_vertical NOT IN ('unclassified', 'payment') AND is_debit = TRUE
    GROUP BY business_vertical, year
    ORDER BY business_vertical, year
""")
classified_summary = cursor.fetchall()

conn.close()

# --- Dropdown values ---
VERTICALS = [
    'personal', 'bohemian_lodges', 'morabeza_suite', 'sunset_studio',
    'maxfield_market', 'maxfield_bakery', 'fee_interest'
]

QBO_CLASSES = [
    'Personal', 'Property Expense', 'Business', 'Fee', 'Investment'
]

QBO_CATEGORIES = [
    'Advertising & Marketing', 'Auto', 'Bank Charges & Fees', 'Business Meals',
    'Cleaning & Maintenance', 'Commissions', 'Computer & Internet', 'Dining',
    'Donation', 'Education & Training', 'Electronics', 'Entertainment',
    'Fee/Interest', 'Gas/Auto', 'Groceries', 'Groceries/Household',
    'Health Care', 'Home Furnishing', 'Insurance', 'Investment',
    'Legal & Professional', 'Lodging', 'Office Supplies', 'Phone/Cable',
    'Repairs & Maintenance', 'Services', 'Shopping', 'Software',
    'Supplies', 'Taxes & Licenses', 'Transfer', 'Travel',
    'Travel/Dining', 'Travel/Lodging', 'Travel/Supplies', 'Utilities'
]

# --- Build sheets ---
print("Building classification sheet...")

# Header row
header = ['ID', 'Date', 'Description', 'Amount', 'Cap One Category', 'Card', 'Year',
          'Business Vertical ▼', 'QBO Class ▼', 'QBO Expense Category ▼', 'Notes']

rows = [header]
for txn in unclassified:
    rows.append([
        txn['id'],
        txn['transaction_date'].strftime('%Y-%m-%d') if txn['transaction_date'] else '',
        txn['description'],
        float(txn['amount']),
        txn['capital_one_category'] or '',
        txn['card_number'] or '',
        txn['year'] or '',
        '',  # Vertical dropdown
        '',  # Class dropdown
        '',  # Category dropdown
        ''   # Notes
    ])

# Also build a "Classified Transactions" reference sheet
classified_header = ['Business Vertical', 'Year', 'Transaction Count', 'Total Spend', 'Categories Used']
classified_rows = [classified_header]
for r in classified_summary:
    classified_rows.append([
        r['business_vertical'],
        r['year'],
        r['cnt'],
        float(r['total']),
        r['categories'] or ''
    ])

# --- Update Google Sheets ---
print("Updating Google Sheets...")

# Get existing sheets
spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
existing_sheets = {s['properties']['title']: s['properties']['sheetId'] for s in spreadsheet['sheets']}

requests_batch = []

# Delete existing sheets if they exist
for sheet_name in ['Capital One - Classify', 'Capital One - Summary']:
    if sheet_name in existing_sheets:
        requests_batch.append({'deleteSheet': {'sheetId': existing_sheets[sheet_name]}})

# Add new sheets
requests_batch.append({
    'addSheet': {'properties': {'title': 'Capital One - Classify', 'index': 0}}
})
requests_batch.append({
    'addSheet': {'properties': {'title': 'Capital One - Summary', 'index': 1}}
})

if requests_batch:
    result = sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': requests_batch}
    ).execute()
    print("  Sheets created")

# Get the new sheet IDs
spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
classify_sheet_id = None
for s in spreadsheet['sheets']:
    if s['properties']['title'] == 'Capital One - Classify':
        classify_sheet_id = s['properties']['sheetId']
        break

# Write data
sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range='Capital One - Classify!A1',
    valueInputOption='USER_ENTERED',
    body={'values': rows}
).execute()
print(f"  Classification sheet: {len(rows)} rows written ({len(unclassified)} transactions to classify)")

sheets_service.spreadsheets().values().update(
    spreadsheetId=SPREADSHEET_ID,
    range='Capital One - Summary!A1',
    valueInputOption='USER_ENTERED',
    body={'values': classified_rows}
).execute()
print(f"  Summary sheet: {len(classified_rows)} rows written")

# --- Add data validation (dropdowns) ---
print("  Adding dropdown validations...")

if classify_sheet_id is not None:
    validation_requests = []
    
    # Column H (index 7) = Business Vertical dropdown
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': classify_sheet_id,
                'startRowIndex': 1,
                'endRowIndex': len(rows),
                'startColumnIndex': 7,
                'endColumnIndex': 8
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in VERTICALS]
                },
                'showCustomUi': True,
                'strict': False
            }
        }
    })
    
    # Column I (index 8) = QBO Class dropdown
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': classify_sheet_id,
                'startRowIndex': 1,
                'endRowIndex': len(rows),
                'startColumnIndex': 8,
                'endColumnIndex': 9
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in QBO_CLASSES]
                },
                'showCustomUi': True,
                'strict': False
            }
        }
    })
    
    # Column J (index 9) = QBO Expense Category dropdown
    validation_requests.append({
        'setDataValidation': {
            'range': {
                'sheetId': classify_sheet_id,
                'startRowIndex': 1,
                'endRowIndex': len(rows),
                'startColumnIndex': 9,
                'endColumnIndex': 10
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': v} for v in QBO_CATEGORIES]
                },
                'showCustomUi': True,
                'strict': False
            }
        }
    })
    
    # Format header row (bold, freeze)
    validation_requests.append({
        'repeatCell': {
            'range': {
                'sheetId': classify_sheet_id,
                'startRowIndex': 0,
                'endRowIndex': 1,
                'startColumnIndex': 0,
                'endColumnIndex': 11
            },
            'cell': {
                'userEnteredFormat': {
                    'textFormat': {'bold': True},
                    'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.95}
                }
            },
            'fields': 'userEnteredFormat(textFormat,backgroundColor)'
        }
    })
    
    # Freeze header row
    validation_requests.append({
        'updateSheetProperties': {
            'properties': {
                'sheetId': classify_sheet_id,
                'gridProperties': {'frozenRowCount': 1}
            },
            'fields': 'gridProperties.frozenRowCount'
        }
    })
    
    # Auto-resize columns
    validation_requests.append({
        'autoResizeDimensions': {
            'dimensions': {
                'sheetId': classify_sheet_id,
                'dimension': 'COLUMNS',
                'startIndex': 0,
                'endIndex': 11
            }
        }
    })
    
    # Color the dropdown columns to highlight they need input
    validation_requests.append({
        'repeatCell': {
            'range': {
                'sheetId': classify_sheet_id,
                'startRowIndex': 1,
                'endRowIndex': len(rows),
                'startColumnIndex': 7,
                'endColumnIndex': 10
            },
            'cell': {
                'userEnteredFormat': {
                    'backgroundColor': {'red': 1.0, 'green': 0.98, 'blue': 0.85}
                }
            },
            'fields': 'userEnteredFormat(backgroundColor)'
        }
    })
    
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={'requests': validation_requests}
    ).execute()
    print("  Dropdowns and formatting applied")

print(f"\n✅ Interactive classification sheet ready!")
print(f"   {len(unclassified)} transactions need manual classification")
print(f"   Workbook: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
print(f"\n   Instructions:")
print(f"   1. Open the 'Capital One - Classify' tab")
print(f"   2. Use the dropdown columns (H, I, J) to select:")
print(f"      - Business Vertical: {', '.join(VERTICALS)}")
print(f"      - QBO Class: {', '.join(QBO_CLASSES)}")
print(f"      - QBO Expense Category: from the dropdown list")
print(f"   3. Add any notes in column K")
print(f"   4. Once done, I can pull the classifications back and update the database")
