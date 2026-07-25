"""
Update the Jamaican Properties 2024 spreadsheet with Source Documentation Links.

Strategy:
1. Read all rows from the Expenses sheet
2. For each 2024 row, find matching document from our DB records
3. Add a "Source Documentation Link" column (column I) with the S3 URL
4. Match by: date (DD/MM/YY format), category, and paidTo
"""

import requests
import json
import re
import datetime

SHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'
TOKEN_FILE = '/home/ubuntu/upload/gmail_access_token.txt'

def get_headers():
    with open(TOKEN_FILE) as f:
        token = f.read().strip()
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }

def get_sheet_values(range_name):
    resp = requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_name}',
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json().get('values', [])

def update_sheet_values(range_name, values):
    body = {
        'values': values,
        'majorDimension': 'ROWS',
    }
    resp = requests.put(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_name}',
        headers=get_headers(),
        params={'valueInputOption': 'RAW'},
        json=body
    )
    resp.raise_for_status()
    return resp.json()

def batch_update(data):
    """Batch update multiple ranges."""
    body = {
        'valueInputOption': 'RAW',
        'data': data,
    }
    resp = requests.post(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values:batchUpdate',
        headers=get_headers(),
        json=body
    )
    resp.raise_for_status()
    return resp.json()

def parse_date(date_str):
    """Parse DD/MM/YY or DD/MM/YYYY format."""
    if not date_str:
        return None
    # Try DD/MM/YY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', date_str.strip())
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        try:
            return datetime.date(year, month, day)
        except ValueError:
            pass
    return None

def main():
    # Load match log from DB
    with open('/home/ubuntu/upload/document_match_log.json') as f:
        match_log = json.load(f)
    
    matched_docs = match_log['matched']
    
    # Build a lookup: (year, month, category_keyword, paidTo_keyword) -> s3Url
    # We'll use a more flexible matching approach
    
    # Get all rows from Expenses sheet
    print('Reading Expenses sheet...')
    all_rows = get_sheet_values('Expenses!A1:Z300')
    print(f'Total rows: {len(all_rows)}')
    
    # Find header row
    header_row = all_rows[0] if all_rows else []
    print('Headers:', header_row)
    
    # Check if Source Documentation Link column already exists
    doc_link_col = None
    for i, h in enumerate(header_row):
        if 'source' in h.lower() or 'documentation' in h.lower() or 'link' in h.lower():
            doc_link_col = i
            print(f'Found existing doc link column at index {doc_link_col}: {h}')
            break
    
    if doc_link_col is None:
        # Add new column at position I (index 8)
        doc_link_col = 8
        print(f'Adding Source Documentation Link column at index {doc_link_col}')
    
    # Build a lookup of matched documents by expense characteristics
    # Key: (year, month, category_upper, paidTo_upper) -> s3Url
    doc_lookup = {}
    for m in matched_docs:
        exp_date = m.get('expense_date', '')
        if exp_date:
            try:
                dt = datetime.date.fromisoformat(exp_date)
                year, month = dt.year, dt.month
            except ValueError:
                continue
        else:
            continue
        
        cat = m.get('expense_category', '').upper()
        paid_to = (m.get('expense_paidTo', '') or '').upper()
        s3_url = m.get('s3Url', '')
        
        key = (year, month, cat, paid_to)
        if key not in doc_lookup:
            doc_lookup[key] = s3_url
    
    print(f'Document lookup entries: {len(doc_lookup)}')
    
    # Process each 2024 row and find matching document
    updates = []
    col_letter = chr(ord('A') + doc_link_col)  # I = index 8
    
    # First, add header if needed
    header_update = {
        'range': f'Expenses!{col_letter}1',
        'values': [['Source Documentation Link']],
    }
    updates.append(header_update)
    
    matched_rows = 0
    unmatched_rows = 0
    
    for row_idx, row in enumerate(all_rows):
        row_num = row_idx + 1  # 1-indexed
        
        # Skip header row
        if row_idx == 0:
            continue
        
        # Only process 2024 rows
        if len(row) < 3 or row[2] != '2024':
            continue
        
        # Parse row data
        date_str = row[0] if len(row) > 0 else ''
        month_str = row[1] if len(row) > 1 else ''
        year_str = row[2] if len(row) > 2 else ''
        expense_desc = row[3] if len(row) > 3 else ''
        category = (row[4] if len(row) > 4 else '').upper()
        amount_str = row[5] if len(row) > 5 else ''
        paid_to = (row[6] if len(row) > 6 else '').upper()
        
        # Parse date
        row_date = parse_date(date_str)
        if not row_date:
            continue
        
        year, month = row_date.year, row_date.month
        
        # Try to find matching document
        s3_url = None
        
        # Try exact match first
        key = (year, month, category, paid_to)
        if key in doc_lookup:
            s3_url = doc_lookup[key]
        else:
            # Try fuzzy match - check if any key matches on year+month+category
            for (k_year, k_month, k_cat, k_paid), url in doc_lookup.items():
                if k_year == year and k_month == month and k_cat == category:
                    # Check paidTo fuzzy match
                    if not paid_to or not k_paid or paid_to in k_paid or k_paid in paid_to:
                        s3_url = url
                        break
        
        if s3_url:
            updates.append({
                'range': f'Expenses!{col_letter}{row_num}',
                'values': [[s3_url]],
            })
            matched_rows += 1
        else:
            unmatched_rows += 1
    
    print(f'\nRows to update: {matched_rows}')
    print(f'Rows without match: {unmatched_rows}')
    
    if updates:
        print(f'\nBatch updating {len(updates)} cells...')
        result = batch_update(updates)
        total_updated = result.get('totalUpdatedCells', 0)
        print(f'Updated {total_updated} cells')
    
    print('\nSpreadsheet update complete!')

if __name__ == '__main__':
    main()
