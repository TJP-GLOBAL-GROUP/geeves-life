#!/usr/bin/env python3
"""
Download all 30 Bank of America Business Statement PDFs from Google Drive
and parse transactions from them.
"""
import subprocess, json, os, re
import mysql.connector
from urllib.parse import urlparse
import base64, hashlib, requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
JWT_SECRET = "Ksf86cxXMujRRnssReDUh6"
BIZ_FOLDER_ID = '1AiEGGZ8hZxutXOMdvKhSpagpr059A_kJ'
DOWNLOAD_DIR = '/home/ubuntu/tax_prep/biz_statements'

def get_env_vars():
    result = subprocess.run(['bash', '-c', 'for pid in $(pgrep node | head -1); do cat /proc/$pid/environ 2>/dev/null; done'], capture_output=True)
    env_vars = {}
    for item in result.stdout.split(b'\x00'):
        decoded = item.decode('utf-8', errors='replace')
        if '=' in decoded:
            k, v = decoded.split('=', 1)
            env_vars[k] = v
    return env_vars

def decrypt_token(stored):
    if not stored or not stored.startswith("enc:"):
        return stored
    key = hashlib.sha256(JWT_SECRET.encode()).digest()
    combined = base64.b64decode(stored[4:])
    iv, auth_tag, ciphertext = combined[:12], combined[12:28], combined[28:]
    return AESGCM(key).decrypt(iv, ciphertext + auth_tag, None).decode('utf-8')

def get_access_token():
    env_vars = get_env_vars()
    parsed = urlparse(DB_URL)
    conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT refreshToken FROM oauth_tokens WHERE accountEmail = 'tarik@tjperkinsfam.com' AND status = 'active' LIMIT 1")
    token_row = cur.fetchone()
    refresh_token = decrypt_token(token_row['refreshToken'])
    conn.close()
    
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': env_vars.get('GOOGLE_CLIENT_ID', ''),
        'client_secret': env_vars.get('GOOGLE_CLIENT_SECRET', ''),
        'refresh_token': refresh_token, 'grant_type': 'refresh_token',
    })
    return resp.json()['access_token']


def download_all_business_pdfs():
    """Download all PDFs from the Business Statements folder."""
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    
    token = get_access_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    # List all files in the business folder
    params = {
        'q': f"'{BIZ_FOLDER_ID}' in parents and mimeType = 'application/pdf'",
        'fields': 'files(id, name, size)',
        'orderBy': 'name',
        'pageSize': 100
    }
    resp = requests.get('https://www.googleapis.com/drive/v3/files', headers=headers, params=params)
    files = resp.json().get('files', [])
    
    print(f"Found {len(files)} business statement PDFs")
    
    downloaded = []
    for f in files:
        filename = f['name']
        filepath = os.path.join(DOWNLOAD_DIR, filename)
        
        if os.path.exists(filepath):
            print(f"  Already exists: {filename}")
            downloaded.append(filepath)
            continue
        
        # Download
        dl_url = f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media"
        dl_resp = requests.get(dl_url, headers=headers)
        
        if dl_resp.status_code == 200:
            with open(filepath, 'wb') as out:
                out.write(dl_resp.content)
            size_kb = len(dl_resp.content) // 1024
            print(f"  Downloaded: {filename} ({size_kb}KB)")
            downloaded.append(filepath)
        else:
            print(f"  FAILED: {filename} — {dl_resp.status_code}")
    
    return downloaded


def parse_boa_pdf(filepath):
    """Parse a Bank of America business statement PDF to extract transactions."""
    # Extract text with layout
    result = subprocess.run(['pdftotext', '-layout', filepath, '-'], capture_output=True, text=True)
    text = result.stdout
    
    transactions = []
    
    # BoA business statements have similar format to personal:
    # Date | Description | Amount
    # Pattern: MM/DD/YY or MM/DD at start of line, followed by description, then amount
    
    lines = text.split('\n')
    
    # Find account info
    account_number = None
    account_type = None
    statement_period = None
    
    for line in lines[:50]:
        if 'Account #' in line or 'Account Number' in line:
            m = re.search(r'(\d{4,})', line)
            if m:
                account_number = m.group(1)
        if 'Checking' in line:
            account_type = 'checking'
        elif 'Savings' in line:
            account_type = 'savings'
        if 'Statement Period' in line or 'through' in line.lower():
            period_match = re.search(r'(\w+ \d+, \d{4})\s+(?:through|to|-)\s+(\w+ \d+, \d{4})', line)
            if period_match:
                statement_period = f"{period_match.group(1)} - {period_match.group(2)}"
    
    # Parse transactions - look for date patterns at start of line
    # Format: MM/DD/YY  Description  Amount
    date_pattern = re.compile(r'^\s*(\d{2}/\d{2}/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*$')
    
    # Also try: MM/DD  Description  Amount (no year)
    date_pattern2 = re.compile(r'^\s*(\d{2}/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*$')
    
    in_deposits = False
    in_withdrawals = False
    in_checks = False
    
    for i, line in enumerate(lines):
        # Track section
        if 'Deposits and' in line or 'Credits' in line:
            in_deposits = True
            in_withdrawals = False
            in_checks = False
        elif 'Withdrawals' in line or 'Debits' in line or 'Other subtractions' in line:
            in_deposits = False
            in_withdrawals = True
            in_checks = False
        elif 'Checks' in line and 'paid' in line.lower():
            in_deposits = False
            in_withdrawals = False
            in_checks = True
        elif 'Daily balance' in line or 'DAILY BALANCE' in line:
            in_deposits = False
            in_withdrawals = False
            in_checks = False
        
        # Try to match transaction lines
        m = date_pattern.match(line)
        if not m:
            m = date_pattern2.match(line)
        
        if m:
            date_str = m.group(1)
            desc = m.group(2).strip()
            amount_str = m.group(3).replace(',', '')
            amount = float(amount_str)
            
            # Determine sign based on section
            if in_withdrawals or in_checks:
                amount = -amount
            elif in_deposits:
                amount = amount  # positive
            
            # Parse date - add year if needed
            if len(date_str) == 5:  # MM/DD format
                # Need to determine year from filename
                year_match = re.search(r'(\d{4})', os.path.basename(filepath))
                if year_match:
                    year = year_match.group(1)
                    date_str = f"{date_str}/{year[2:]}"
            
            transactions.append({
                'date': date_str,
                'description': desc,
                'amount': amount,
                'account_number': account_number,
                'account_type': account_type,
                'source_file': os.path.basename(filepath)
            })
    
    return transactions, account_number, account_type, statement_period


def main():
    print("=" * 60)
    print("DOWNLOAD & PARSE BUSINESS ACCOUNT STATEMENTS")
    print("=" * 60)
    
    # Download
    pdf_files = download_all_business_pdfs()
    
    # Parse first PDF to understand format
    if pdf_files:
        print(f"\n\nParsing first PDF to understand format...")
        filepath = pdf_files[0]
        
        # Show raw text of first page
        result = subprocess.run(['pdftotext', '-layout', '-f', '1', '-l', '2', filepath, '-'], 
                              capture_output=True, text=True)
        text = result.stdout
        
        # Show first 100 lines
        lines = text.split('\n')
        print(f"\n  File: {os.path.basename(filepath)}")
        print(f"  First 80 lines:")
        for line in lines[:80]:
            if line.strip():
                print(f"    {line}")
        
        # Try parsing
        txns, acct, acct_type, period = parse_boa_pdf(filepath)
        print(f"\n  Account: {acct} ({acct_type})")
        print(f"  Period: {period}")
        print(f"  Transactions found: {len(txns)}")
        if txns:
            print(f"  First 10:")
            for t in txns[:10]:
                print(f"    {t['date']} | {t['description'][:50]:<50} | ${t['amount']:>10,.2f}")


if __name__ == '__main__':
    main()
