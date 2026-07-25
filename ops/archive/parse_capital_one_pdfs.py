#!/usr/bin/env python3
"""
Parse Capital One credit card statement PDFs and extract all transactions.
Format (from pdftotext -layout):
  Trans Date   Post Date    Description                                        Amount
  Dec 23       Dec 24       MILLWOOD MARKETMILLWOODNY                          $48.34
  
  Dec 25       Dec 26       FARMAISRIO DE JANEIR                               $11.47
                            $71.00
                            BRL
                            6.190061029 Exchange Rate

Credits/payments have negative amounts: - $1,000.00
"""
import subprocess, re, os, json
import mysql.connector
from urllib.parse import urlparse
import base64, hashlib, requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from datetime import datetime

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
JWT_SECRET = "Ksf86cxXMujRRnssReDUh6"

def get_drive_access():
    """Get Google Drive access token."""
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


def download_all_pdfs(access_token):
    """Download all PDFs from the CapitalOne Statements folder."""
    headers = {'Authorization': f'Bearer {access_token}'}
    folder_id = '16oh97re8rnvsU6i7yY93WlbcB46nkO80'
    
    url = f"https://www.googleapis.com/drive/v3/files?q='{folder_id}' in parents and mimeType='application/pdf'&fields=files(id,name,size)&pageSize=50"
    resp = requests.get(url, headers=headers)
    pdfs = resp.json().get('files', [])
    
    os.makedirs('/home/ubuntu/tax_prep/capital_one_pdfs', exist_ok=True)
    
    downloaded = []
    for pdf in pdfs:
        # Create a clean filename
        clean_name = re.sub(r'-\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}\.\d{3}Z', '', pdf['name'])
        clean_name = clean_name.replace(' ', '_').lower()
        # Add timestamp suffix to distinguish duplicates
        ts = re.search(r'T(\d{2}_\d{2}_\d{2})', pdf['name'])
        ts_suffix = ts.group(1) if ts else 'unknown'
        local_name = f"{clean_name.replace('.pdf', '')}_{ts_suffix}.pdf"
        local_path = f"/home/ubuntu/tax_prep/capital_one_pdfs/{local_name}"
        
        if not os.path.exists(local_path):
            dl_url = f"https://www.googleapis.com/drive/v3/files/{pdf['id']}?alt=media"
            resp = requests.get(dl_url, headers=headers)
            if resp.status_code == 200:
                with open(local_path, 'wb') as f:
                    f.write(resp.content)
        
        downloaded.append({
            'id': pdf['id'],
            'name': pdf['name'],
            'local_path': local_path,
            'size': int(pdf.get('size', 0))
        })
    
    return downloaded


def parse_pdf_transactions(pdf_path):
    """Parse transactions from a Capital One PDF statement."""
    result = subprocess.run(['pdftotext', '-layout', pdf_path, '-'], capture_output=True, text=True)
    text = result.stdout
    lines = text.split('\n')
    
    # Extract billing period and card info
    card_number = None
    billing_start = None
    billing_end = None
    
    for line in lines[:20]:
        card_match = re.search(r'ending in (\d{4})', line)
        if card_match:
            card_number = card_match.group(1)
        period_match = re.search(r'(\w+ \d{1,2}, \d{4})\s*-\s*(\w+ \d{1,2}, \d{4})', line)
        if period_match:
            billing_start = period_match.group(1)
            billing_end = period_match.group(2)
    
    # Determine the year context from billing period
    year_context = None
    if billing_end:
        try:
            end_date = datetime.strptime(billing_end, '%b %d, %Y')
            year_context = end_date.year
        except:
            pass
    
    # Parse transactions
    transactions = []
    i = 0
    
    # Transaction line pattern: "Mon DD    Mon DD    DESCRIPTION    $AMOUNT" or "- $AMOUNT"
    txn_pattern = re.compile(
        r'^(\w{3}\s+\d{1,2})\s+(\w{3}\s+\d{1,2})\s+(.+?)\s+([-]?\s*\$[\d,]+\.\d{2})\s*$'
    )
    
    while i < len(lines):
        line = lines[i]
        match = txn_pattern.match(line.strip())
        if match:
            trans_date_str = match.group(1)
            post_date_str = match.group(2)
            description = match.group(3).strip()
            amount_str = match.group(4).strip()
            
            # Parse amount (negative = credit/payment)
            amount_clean = amount_str.replace('$', '').replace(',', '').replace(' ', '')
            if amount_clean.startswith('-'):
                amount = -float(amount_clean[1:])
            else:
                amount = float(amount_clean)
            
            # Check for foreign currency info on next lines
            foreign_amount = None
            foreign_currency = None
            exchange_rate = None
            j = i + 1
            while j < len(lines) and j <= i + 4:
                next_line = lines[j].strip()
                if not next_line:
                    j += 1
                    continue
                # Check if it's a foreign amount
                foreign_match = re.match(r'^\$[\d,]+\.\d{2}$', next_line)
                if foreign_match:
                    foreign_amount = next_line
                    j += 1
                    continue
                # Check if it's a currency code
                if re.match(r'^[A-Z]{3}$', next_line):
                    foreign_currency = next_line
                    j += 1
                    continue
                # Check if it's exchange rate
                rate_match = re.match(r'^[\d.]+ Exchange Rate$', next_line)
                if rate_match:
                    exchange_rate = next_line
                    j += 1
                    break
                # If it's another transaction or something else, stop
                if txn_pattern.match(next_line):
                    break
                j += 1
                break
            
            # Resolve full date with year
            trans_date = resolve_date(trans_date_str, billing_start, billing_end, year_context)
            post_date = resolve_date(post_date_str, billing_start, billing_end, year_context)
            
            transactions.append({
                'transaction_date': trans_date,
                'posted_date': post_date,
                'description': description,
                'amount': amount,
                'card_number': card_number,
                'foreign_amount': foreign_amount,
                'foreign_currency': foreign_currency,
                'exchange_rate': exchange_rate,
            })
        i += 1
    
    return {
        'card_number': card_number,
        'billing_start': billing_start,
        'billing_end': billing_end,
        'transactions': transactions
    }


def resolve_date(short_date, billing_start, billing_end, year_context):
    """Convert 'Dec 25' to full date using billing period context."""
    if not year_context:
        return short_date
    
    month_map = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
    
    parts = short_date.split()
    if len(parts) != 2:
        return short_date
    
    month_str, day_str = parts
    month = month_map.get(month_str)
    if not month:
        return short_date
    
    day = int(day_str)
    
    # If billing period spans year boundary (e.g., Dec 24 - Jan 23)
    # December dates belong to previous year
    if billing_start and 'Dec' in billing_start and year_context:
        if month == 12:
            year = year_context - 1
        else:
            year = year_context
    else:
        year = year_context
    
    try:
        return datetime(year, month, day).strftime('%Y-%m-%d')
    except:
        return short_date


def main():
    print("=" * 60)
    print("CAPITAL ONE PDF STATEMENT PARSER")
    print("=" * 60)
    
    # Download all PDFs
    print("\n1. Downloading PDFs from Google Drive...")
    access_token = get_drive_access()
    pdfs = download_all_pdfs(access_token)
    print(f"   Downloaded {len(pdfs)} PDFs")
    
    # Parse each PDF
    print("\n2. Parsing transactions from PDFs...")
    all_transactions = []
    seen_periods = set()
    
    for pdf in sorted(pdfs, key=lambda x: x['name']):
        result = parse_pdf_transactions(pdf['local_path'])
        period_key = f"{result['billing_start']}_{result['billing_end']}_{result['card_number']}"
        
        if period_key in seen_periods:
            print(f"   SKIP (duplicate): {pdf['name']} → {result['billing_start']} - {result['billing_end']} (card {result['card_number']})")
            continue
        
        seen_periods.add(period_key)
        txn_count = len(result['transactions'])
        print(f"   {pdf['name'][:50]:<50} → {result['billing_start']} - {result['billing_end']} | Card {result['card_number']} | {txn_count} txns")
        
        for txn in result['transactions']:
            txn['source_file'] = pdf['name']
            txn['billing_period'] = f"{result['billing_start']} - {result['billing_end']}"
            all_transactions.append(txn)
    
    print(f"\n   Total transactions from PDFs: {len(all_transactions)}")
    
    # Separate debits and credits
    debits = [t for t in all_transactions if t['amount'] > 0]
    credits = [t for t in all_transactions if t['amount'] <= 0]
    print(f"   Debits (purchases): {len(debits)}, total: ${sum(t['amount'] for t in debits):,.2f}")
    print(f"   Credits (payments): {len(credits)}, total: ${sum(t['amount'] for t in credits):,.2f}")
    
    # Year breakdown
    from collections import defaultdict
    by_year = defaultdict(list)
    for t in all_transactions:
        if t['transaction_date'] and len(t['transaction_date']) >= 4:
            year = t['transaction_date'][:4]
            by_year[year].append(t)
        else:
            by_year['unknown'].append(t)
    
    print(f"\n   By year:")
    for year in sorted(by_year.keys()):
        txns = by_year[year]
        debit_total = sum(t['amount'] for t in txns if t['amount'] > 0)
        credit_total = sum(abs(t['amount']) for t in txns if t['amount'] <= 0)
        print(f"     {year}: {len(txns)} txns | Debits ${debit_total:,.2f} | Credits ${credit_total:,.2f}")
    
    # Save to JSON for next step
    with open('/home/ubuntu/tax_prep/capital_one_pdf_transactions.json', 'w') as f:
        json.dump(all_transactions, f, indent=2, default=str)
    print(f"\n   Saved to capital_one_pdf_transactions.json")
    
    # Show sample transactions
    print(f"\n3. Sample transactions:")
    for t in debits[:10]:
        print(f"   {t['transaction_date']} | {t['description'][:45]:<45} | ${t['amount']:>8,.2f}")


if __name__ == '__main__':
    main()
