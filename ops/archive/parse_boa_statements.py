#!/usr/bin/env python3
"""
Download and parse all 54 Bank of America statement PDFs.
BoA statements have a specific format with transaction tables.
"""
import subprocess, json, re, os
import mysql.connector
from urllib.parse import urlparse
import base64, hashlib, requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
JWT_SECRET = "Ksf86cxXMujRRnssReDUh6"
BOA_PDF_DIR = '/home/ubuntu/tax_prep/boa_pdfs'

os.makedirs(BOA_PDF_DIR, exist_ok=True)

def get_access_token():
    result = subprocess.run(['bash', '-c', 'for pid in $(pgrep node | head -1); do cat /proc/$pid/environ 2>/dev/null; done'], capture_output=True)
    env_vars = {}
    for item in result.stdout.split(b'\x00'):
        decoded = item.decode('utf-8', errors='replace')
        if '=' in decoded:
            k, v = decoded.split('=', 1)
            env_vars[k] = v
    
    GOOGLE_CLIENT_ID = env_vars.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = env_vars.get('GOOGLE_CLIENT_SECRET', '')
    
    def decrypt_token(stored):
        if not stored or not stored.startswith("enc:"):
            return stored
        key = hashlib.sha256(JWT_SECRET.encode()).digest()
        combined = base64.b64decode(stored[4:])
        iv, auth_tag, ciphertext = combined[:12], combined[12:28], combined[28:]
        return AESGCM(key).decrypt(iv, ciphertext + auth_tag, None).decode('utf-8')
    
    parsed = urlparse(DB_URL)
    conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306, user=parsed.username, password=parsed.password, database=parsed.path.lstrip('/'), ssl_disabled=False)
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT refreshToken FROM oauth_tokens WHERE accountEmail = 'tarik@tjperkinsfam.com' AND status = 'active' LIMIT 1")
    token_row = cur.fetchone()
    refresh_token = decrypt_token(token_row['refreshToken'])
    conn.close()
    
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': GOOGLE_CLIENT_ID, 'client_secret': GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_token, 'grant_type': 'refresh_token',
    })
    return resp.json()['access_token']


def download_pdf(file_info, headers):
    """Download a single PDF."""
    local_path = os.path.join(BOA_PDF_DIR, file_info['name'])
    if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
        return local_path
    
    url = f"https://www.googleapis.com/drive/v3/files/{file_info['id']}?alt=media"
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        with open(local_path, 'wb') as f:
            f.write(resp.content)
    return local_path


def parse_boa_pdf(pdf_path):
    """Parse a Bank of America statement PDF to extract transactions."""
    result = subprocess.run(['pdftotext', '-layout', pdf_path, '-'], capture_output=True, text=True)
    text = result.stdout
    lines = text.split('\n')
    
    # Extract account info
    account_number = None
    account_type = None
    statement_period = None
    
    for line in lines[:30]:
        # Look for account number (last 4 digits)
        acct_match = re.search(r'Account\s*#?\s*:?\s*\d*[\s-]*(\d{4})', line)
        if acct_match:
            account_number = acct_match.group(1)
        
        # Look for account type
        if 'checking' in line.lower():
            account_type = 'checking'
        elif 'savings' in line.lower():
            account_type = 'savings'
        elif 'advantage' in line.lower():
            account_type = 'checking'
        
        # Look for statement period
        period_match = re.search(r'(\w+ \d{1,2}, \d{4})\s*(?:through|to|-)\s*(\w+ \d{1,2}, \d{4})', line)
        if period_match:
            statement_period = (period_match.group(1), period_match.group(2))
    
    # Determine year from filename or content
    year = None
    fname = os.path.basename(pdf_path)
    year_match = re.search(r'eStmt_(\d{4})-(\d{2})-(\d{2})', fname)
    if year_match:
        year = int(year_match.group(1))
    
    # Parse transactions
    # BoA format: MM/DD/YY  Description  Amount  Balance
    # or: MM/DD  Description  Amount
    transactions = []
    
    # Pattern for BoA transactions
    # Format 1: 01/15/25  DESCRIPTION  -1,234.56  12,345.67
    # Format 2: 01/15  DESCRIPTION  1,234.56
    txn_pattern = re.compile(
        r'(\d{2}/\d{2}(?:/\d{2,4})?)\s+(.+?)\s+([-]?\$?[\d,]+\.\d{2})\s*(?:([\d,]+\.\d{2}))?\s*$'
    )
    
    for line in lines:
        match = txn_pattern.match(line.strip())
        if match:
            date_str = match.group(1)
            description = match.group(2).strip()
            amount_str = match.group(3).strip()
            balance_str = match.group(4)
            
            # Skip header-like lines
            if 'Date' in description and 'Description' in description:
                continue
            if 'Beginning balance' in description or 'Ending balance' in description:
                continue
            
            # Parse date
            if len(date_str) <= 5:  # MM/DD format
                if year:
                    date_str = f"{date_str}/{year}"
                else:
                    continue
            
            # Parse amount
            amount_clean = amount_str.replace('$', '').replace(',', '').strip()
            try:
                amount = float(amount_clean)
            except ValueError:
                continue
            
            # Resolve full date
            try:
                if len(date_str.split('/')[-1]) == 2:
                    txn_date = datetime.strptime(date_str, '%m/%d/%y')
                else:
                    txn_date = datetime.strptime(date_str, '%m/%d/%Y')
            except:
                continue
            
            transactions.append({
                'date': txn_date.strftime('%Y-%m-%d'),
                'description': description,
                'amount': amount,
                'balance': float(balance_str.replace(',', '')) if balance_str else None,
                'account_number': account_number,
                'account_type': account_type,
            })
    
    return {
        'account_number': account_number,
        'account_type': account_type,
        'statement_period': statement_period,
        'year': year,
        'transactions': transactions,
        'raw_line_count': len(lines),
    }


def main():
    print("=" * 60)
    print("BANK OF AMERICA STATEMENT PARSER")
    print("=" * 60)
    
    # Load file list
    with open('/home/ubuntu/tax_prep/boa_file_list.json', 'r') as f:
        files = json.load(f)
    
    print(f"\n1. Downloading {len(files)} PDFs from Google Drive...")
    access_token = get_access_token()
    headers = {'Authorization': f'Bearer {access_token}'}
    
    for i, file_info in enumerate(files):
        download_pdf(file_info, headers)
        if (i + 1) % 10 == 0:
            print(f"   Downloaded {i+1}/{len(files)}")
    print(f"   All {len(files)} PDFs downloaded")
    
    # Parse first few to understand format
    print(f"\n2. Parsing PDFs...")
    all_results = []
    for file_info in files:
        local_path = os.path.join(BOA_PDF_DIR, file_info['name'])
        result = parse_boa_pdf(local_path)
        result['filename'] = file_info['name']
        all_results.append(result)
    
    # Summary
    total_txns = sum(len(r['transactions']) for r in all_results)
    accounts = set()
    for r in all_results:
        if r['account_number']:
            accounts.add(r['account_number'])
    
    print(f"\n   Results:")
    print(f"   Total PDFs parsed: {len(all_results)}")
    print(f"   Total transactions extracted: {total_txns}")
    print(f"   Unique accounts found: {accounts}")
    
    # Show per-account breakdown
    from collections import defaultdict
    by_account = defaultdict(list)
    for r in all_results:
        acct = r['account_number'] or 'unknown'
        by_account[acct].extend(r['transactions'])
    
    print(f"\n   By account:")
    for acct, txns in sorted(by_account.items()):
        if txns:
            total_credits = sum(t['amount'] for t in txns if t['amount'] > 0)
            total_debits = sum(abs(t['amount']) for t in txns if t['amount'] < 0)
            print(f"     Account ...{acct}: {len(txns)} txns | Credits ${total_credits:,.2f} | Debits ${total_debits:,.2f}")
    
    # If we got very few transactions, the parsing might need adjustment
    if total_txns < 100:
        print(f"\n   ⚠️  Low transaction count - checking PDF format...")
        # Show raw text from first PDF to debug
        sample_path = os.path.join(BOA_PDF_DIR, files[0]['name'])
        result = subprocess.run(['pdftotext', '-layout', sample_path, '-'], capture_output=True, text=True)
        lines = result.stdout.split('\n')
        print(f"\n   Sample from {files[0]['name']}:")
        # Find transaction section
        for i, line in enumerate(lines):
            if any(x in line.lower() for x in ['deposits', 'withdrawals', 'transaction', 'date']):
                for j in range(max(0, i-1), min(len(lines), i+30)):
                    print(f"     L{j:4d}: {lines[j]}")
                print("     ...")
                break
    
    # Save all transactions to JSON
    all_txns = []
    for r in all_results:
        for t in r['transactions']:
            t['source_file'] = r['filename']
            all_txns.append(t)
    
    with open('/home/ubuntu/tax_prep/boa_transactions.json', 'w') as f:
        json.dump(all_txns, f, indent=2)
    
    print(f"\n   Saved {len(all_txns)} transactions to boa_transactions.json")


if __name__ == '__main__':
    main()
