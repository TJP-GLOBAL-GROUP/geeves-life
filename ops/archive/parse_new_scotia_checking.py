"""
Parse the two new Scotia Checking statements (Dec 2025, Feb 2026) and add to DB + Google Sheet.
Statement format:
- Date in format like "17NOV", "16JAN" etc (left-aligned)
- Description follows on same or next line
- Amounts have "J$ X,XXX.XX +" for credits or "J$ X,XXX.XX -" for debits
- Balance at end of line (sometimes #Error)
- Statement period shown in header (e.g., "15NOV25 to 15DEC25")
"""
import re, json, requests, mysql.connector, time, subprocess, os
from urllib.parse import urlparse
from datetime import datetime

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
SPREADSHEET_ID = "1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI"

def get_access_token():
    with open('/home/ubuntu/tax_prep/.google_creds.json') as f:
        creds = json.load(f)
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': creds['client_id'], 'client_secret': creds['client_secret'],
        'refresh_token': creds['refresh_token'], 'grant_type': 'refresh_token',
    })
    return resp.json()['access_token']

def parse_scotia_checking_pdf(filepath):
    """Parse a Scotia Day-To-Day checking statement PDF."""
    result = subprocess.run(['pdftotext', '-layout', filepath, '-'], capture_output=True, text=True)
    text = result.stdout
    lines = text.split('\n')
    
    # Find statement period
    period_match = re.search(r'Statement Period:\s+(\d{2}\w{3}\d{2})\s+to\s+(\d{2}\w{3}\d{2})', text)
    if period_match:
        start_str = period_match.group(1)
        end_str = period_match.group(2)
        # Parse end date to determine year
        end_date = datetime.strptime(end_str, '%d%b%y')
        statement_year = end_date.year
        statement_month = end_date.month
        print(f"  Statement period: {start_str} to {end_str} (year={statement_year})")
    else:
        statement_year = 2025
        statement_month = 12
        print(f"  Could not find statement period, defaulting to {statement_year}")
    
    transactions = []
    current_txn = None
    in_transactions = False
    
    # Month abbreviations for date parsing
    months = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
              'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}
    
    for line in lines:
        stripped = line.strip()
        
        # Skip empty lines
        if not stripped:
            continue
            
        # Detect start of transaction section
        if 'OPENING BALANCE' in stripped:
            in_transactions = True
            continue
        
        # Detect end of transaction section
        if 'CLOSING BALANCE' in stripped:
            if current_txn:
                transactions.append(current_txn)
                current_txn = None
            in_transactions = False
            continue
        
        if not in_transactions:
            continue
        
        # Skip service charge section headers
        if 'SERVICE CHARGE' in stripped or 'Page' in stripped or 'Trademark' in stripped:
            continue
        
        # Try to match a transaction line starting with a date (e.g., "17NOV" or "16JAN")
        date_match = re.match(r'\s{0,10}(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s', line)
        
        if date_match:
            # Save previous transaction
            if current_txn:
                transactions.append(current_txn)
            
            day = int(date_match.group(1))
            month_str = date_match.group(2)
            month_num = months[month_str]
            
            # Determine year based on statement period
            # If month is after statement end month, it's previous year
            if month_num > statement_month:
                txn_year = statement_year - 1
            else:
                txn_year = statement_year
            
            txn_date = f"{txn_year}-{month_num:02d}-{day:02d}"
            
            # Extract description (after the date)
            rest = line[date_match.end():]
            
            # Extract amounts - credit (with +) or debit (with -)
            credit = None
            debit = None
            balance = None
            
            credit_match = re.search(r'J\$\s*([\d,]+\.\d{2})\s*\+', rest)
            debit_match = re.search(r'J\$\s*([\d,]+\.\d{2})\s*-', rest)
            balance_match = re.search(r'J\$\s*([\d,]+\.\d{2})\s*$', rest)
            
            if credit_match:
                credit = float(credit_match.group(1).replace(',', ''))
            if debit_match:
                debit = float(debit_match.group(1).replace(',', ''))
            if balance_match and not credit_match and not debit_match:
                # This might be a balance-only line
                balance = float(balance_match.group(1).replace(',', ''))
            
            # Description is everything between date and amounts
            desc = rest
            # Remove amount patterns from description
            desc = re.sub(r'J\$\s*[\d,]+\.\d{2}\s*[+-]?', '', desc)
            desc = re.sub(r'#Error', '', desc)
            desc = desc.strip()
            
            current_txn = {
                'date': txn_date,
                'description': desc,
                'credit': credit,
                'debit': debit,
                'balance': balance,
                'year': txn_year,
                'month': month_num,
            }
        elif current_txn:
            # Continuation line - append to description
            # But check if it has amounts
            credit_match = re.search(r'J\$\s*([\d,]+\.\d{2})\s*\+', stripped)
            debit_match = re.search(r'J\$\s*([\d,]+\.\d{2})\s*-', stripped)
            
            if credit_match and current_txn['credit'] is None:
                current_txn['credit'] = float(credit_match.group(1).replace(',', ''))
            if debit_match and current_txn['debit'] is None:
                current_txn['debit'] = float(debit_match.group(1).replace(',', ''))
            
            # Add to description (remove amounts)
            desc_part = re.sub(r'J\$\s*[\d,]+\.\d{2}\s*[+-]?', '', stripped)
            desc_part = re.sub(r'#Error', '', desc_part).strip()
            if desc_part and not desc_part.startswith('*'):
                current_txn['description'] += ' ' + desc_part
    
    # Don't forget last transaction
    if current_txn:
        transactions.append(current_txn)
    
    return transactions, statement_year, statement_month


def main():
    # Parse both statements
    all_transactions = []
    
    pdfs = [
        'scotia_checking/statement_Day-To-Day Account_0505_December_15_25.pdf',
        'scotia_checking/statement_Day-To-Day Account_0505_February_15_26.pdf',
    ]
    
    for pdf in pdfs:
        print(f"\nParsing: {pdf}")
        txns, year, month = parse_scotia_checking_pdf(pdf)
        print(f"  Found {len(txns)} transactions")
        for t in txns:
            print(f"    {t['date']} | {t['description'][:50]} | C:{t['credit']} D:{t['debit']}")
        all_transactions.extend(txns)
    
    print(f"\nTotal new transactions: {len(all_transactions)}")
    
    # Insert into database
    parsed = urlparse(DB_URL)
    conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, 
                                   user=parsed.username, password=parsed.password, 
                                   database=parsed.path.lstrip('/'), ssl_disabled=False)
    cur = conn.cursor()
    
    # Check for duplicates before inserting
    inserted = 0
    for t in all_transactions:
        # Check if this transaction already exists
        cur.execute("""
            SELECT id FROM financial_transactions 
            WHERE accountId = 1 AND transactionDate = %s AND description LIKE %s
            AND (debitAmount = %s OR creditAmount = %s)
        """, (t['date'], f"%{t['description'][:30]}%", t['debit'], t['credit']))
        
        if cur.fetchone() is None:
            cur.execute("""
                INSERT INTO financial_transactions 
                (householdId, accountId, transactionDate, description, debitAmount, creditAmount,
                 currency, vertical, source, statementYear, statementMonth, createdAt, updatedAt)
                VALUES (%s, 1, %s, %s, %s, %s, 'JMD', 'unclassified', 'bank_statement', %s, %s, NOW(), NOW())
            """, ('default', t['date'], t['description'].strip(), t['debit'], t['credit'],
                  t['year'], t['month']))
            inserted += 1
    
    conn.commit()
    print(f"\nInserted {inserted} new transactions (skipped {len(all_transactions) - inserted} duplicates)")
    
    # Now get ALL Scotia Checking data and update the Google Sheet tab
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT transactionDate, description, debitAmount, creditAmount, balance,
               currency, vertical, expenseCategory, statementYear, statementMonth
        FROM financial_transactions
        WHERE accountId = 1
        ORDER BY transactionDate DESC
    """)
    all_data = cur.fetchall()
    print(f"\nTotal Scotia Checking transactions now: {len(all_data)}")
    print(f"  Date range: {all_data[-1]['transactionDate']} to {all_data[0]['transactionDate']}")
    
    conn.close()
    
    # Update Google Sheet
    access_token = get_access_token()
    
    headers_row = ["Date", "Description", "Debit", "Credit", "Balance", "Currency",
                   "Current Vertical", "VERTICAL (edit)", "SPLIT % (edit)", "QBO CATEGORY (edit)"]
    rows = [headers_row]
    for t in all_data:
        rows.append([
            str(t['transactionDate'] or ''),
            str(t['description'] or ''),
            str(t['debitAmount'] or ''),
            str(t['creditAmount'] or ''),
            str(t['balance'] or ''),
            str(t['currency'] or ''),
            str(t['vertical'] or ''),
            str(t['vertical'] or ''),
            '100%',
            str(t['expenseCategory'] or ''),
        ])
    
    # Get existing sheets to find Scotia Checking sheet ID
    resp = requests.get(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}',
        headers={'Authorization': f'Bearer {access_token}'},
        params={'fields': 'sheets.properties'}
    )
    existing_sheets = {}
    if resp.status_code == 200:
        for s in resp.json().get('sheets', []):
            props = s['properties']
            existing_sheets[props['title']] = props['sheetId']
    
    sheet_id = existing_sheets.get('Scotia Checking')
    if sheet_id:
        # Clear and resize
        requests.post(
            f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}:batchUpdate',
            headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
            json={'requests': [
                {'updateCells': {'range': {'sheetId': sheet_id}, 'fields': 'userEnteredValue'}},
                {'updateSheetProperties': {
                    'properties': {'sheetId': sheet_id, 'gridProperties': {'rowCount': len(rows) + 10, 'columnCount': 12}},
                    'fields': 'gridProperties.rowCount,gridProperties.columnCount'
                }}
            ]}
        )
        
        # Write data in batches
        for i in range(0, len(rows), 500):
            batch = rows[i:i+500]
            start_row = i + 1
            requests.put(
                f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/\'Scotia Checking\'!A{start_row}',
                headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
                params={'valueInputOption': 'RAW'},
                json={'range': f"'Scotia Checking'!A{start_row}", 'majorDimension': 'ROWS', 'values': batch}
            )
            time.sleep(0.5)
        
        print(f"\n✅ Scotia Checking sheet updated with {len(rows)-1} transactions")
    else:
        print("ERROR: Scotia Checking sheet not found!")


if __name__ == '__main__':
    main()
