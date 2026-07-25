"""
Scrape Zelle, Venmo, and Cash App payment emails for contractor/service payments.
These are payments to cleaners, maintenance, repair, and construction workers.
"""
import hashlib, base64, requests, json, sys, subprocess
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime

print("=" * 60)
print("PAYMENT TRANSFER EMAIL SCRAPER — Zelle/Venmo/Cash App")
print("=" * 60)

# Config
JWT_SECRET = 'Ksf86cxXMujRRnssReDUh6'
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

# Get env vars
result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f tsx | head -1)/environ 2>/dev/null | tr "\\0" "\\n"'], 
                      capture_output=True, text=True)
FORGE_API_URL = FORGE_API_KEY = GOOGLE_CLIENT_ID = GOOGLE_CLIENT_SECRET = None
for line in result.stdout.strip().split('\n'):
    if '=' in line:
        k, v = line.split('=', 1)
        if k == 'GOOGLE_CLIENT_ID': GOOGLE_CLIENT_ID = v
        elif k == 'GOOGLE_CLIENT_SECRET': GOOGLE_CLIENT_SECRET = v
        elif k == 'BUILT_IN_FORGE_API_URL': FORGE_API_URL = v
        elif k == 'BUILT_IN_FORGE_API_KEY': FORGE_API_KEY = v

key = hashlib.sha256(JWT_SECRET.encode()).digest()

def decrypt_token(encrypted):
    if not encrypted or not encrypted.startswith('enc:'):
        return encrypted
    combined = base64.b64decode(encrypted[4:])
    iv, auth_tag, ciphertext = combined[:12], combined[12:28], combined[28:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext + auth_tag, None).decode('utf-8')

def get_access_token(email):
    p = urlparse(DB_URL)
    conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
    cur = conn.cursor(dictionary=True)
    cur.execute("""SELECT refreshToken FROM oauth_tokens 
                   WHERE accountEmail = %s AND scopes LIKE '%%gmail.readonly%%' AND status = 'active' 
                   ORDER BY updatedAt DESC LIMIT 1""", (email,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    refresh_tok = decrypt_token(row['refreshToken'])
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': GOOGLE_CLIENT_ID, 'client_secret': GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_tok, 'grant_type': 'refresh_token'
    })
    if resp.status_code == 200:
        return resp.json()['access_token']
    return None

def search_emails(access_token, query, max_results=500):
    messages = []
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=100'
    while url and len(messages) < max_results:
        resp = requests.get(url, headers={'Authorization': f'Bearer {access_token}'})
        if resp.status_code != 200:
            break
        data = resp.json()
        messages.extend(data.get('messages', []))
        next_token = data.get('nextPageToken')
        url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=100&pageToken={next_token}' if next_token else None
    return messages

def get_email_content(access_token, msg_id):
    resp = requests.get(
        f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full',
        headers={'Authorization': f'Bearer {access_token}'}
    )
    if resp.status_code != 200:
        return None, None, None
    msg = resp.json()
    headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
    subject = headers.get('subject', '')
    date_str = headers.get('date', '')
    
    body = ''
    payload = msg.get('payload', {})
    def extract_text(part):
        if part.get('body', {}).get('data'):
            return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
        return ''
    
    if payload.get('parts'):
        for part in payload['parts']:
            if part.get('mimeType') in ('text/plain', 'text/html'):
                body += extract_text(part) + '\n'
            if part.get('parts'):
                for subpart in part['parts']:
                    if subpart.get('mimeType') in ('text/plain', 'text/html'):
                        body += extract_text(subpart) + '\n'
    else:
        body = extract_text(payload)
    
    return subject, date_str, body[:6000]

def parse_payment_with_llm(platform, subject, body, date_str):
    prompt = f"""Extract payment transfer information from this {platform} email notification.

Return JSON with:
- isPayment: true if this is a SENT payment (money you paid someone), false if received or other notification
- recipientName: name of person/business you paid
- amount: dollar amount as number (no $ sign)
- currency: "USD" or "JMD"
- date: payment date in YYYY-MM-DD format (from email date: {date_str})
- note: the payment note/memo/purpose if included
- transactionId: any confirmation/transaction ID

If this is NOT a sent payment (e.g., received money, account notification, promo), return {{"isPayment": false}}

Email subject: {subject}
Email body (first 3000 chars):
{body[:3000]}"""

    try:
        resp = requests.post(
            f"{FORGE_API_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {FORGE_API_KEY}", "Content-Type": "application/json"},
            json={"messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}},
            timeout=30
        )
        if resp.status_code == 200:
            return json.loads(resp.json()['choices'][0]['message']['content'])
    except:
        pass
    return None

# Payment search queries
PAYMENT_QUERIES = {
    'Zelle': [
        'from:alerts@notify.zelle.com subject:"You sent" after:2024/01/01',
        'from:no-reply@zellepay.com subject:"sent" after:2024/01/01',
        'subject:zelle subject:sent after:2024/01/01',
    ],
    'Venmo': [
        'from:venmo@venmo.com subject:"You paid" after:2024/01/01',
        'from:venmo@venmo.com subject:"completed" after:2024/01/01',
    ],
    'CashApp': [
        'from:cash@square.com subject:"You paid" after:2024/01/01',
        'from:cash@cash.app subject:"sent" after:2024/01/01',
        'from:no-reply@cash.app subject:"payment" after:2024/01/01',
    ],
}

# Create payments table if not exists
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

try:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS contractor_payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId INT NOT NULL DEFAULT 1,
            platform VARCHAR(50) NOT NULL,
            recipientName VARCHAR(255) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            currency VARCHAR(3) DEFAULT 'USD',
            paymentDate DATE NOT NULL,
            note TEXT,
            transactionId VARCHAR(255),
            emailAccount VARCHAR(255),
            gmailMessageId VARCHAR(255),
            propertyAttribution VARCHAR(100) DEFAULT 'unclassified',
            expenseCategory VARCHAR(100) DEFAULT NULL,
            isTaxDeductible TINYINT(1) DEFAULT 0,
            aiConfidence INT DEFAULT NULL,
            qboExpenseId VARCHAR(100) DEFAULT NULL,
            qboSyncStatus VARCHAR(50) DEFAULT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_txn (platform, transactionId),
            INDEX idx_property (propertyAttribution),
            INDEX idx_date (paymentDate)
        )
    """)
    conn.commit()
    print("✓ contractor_payments table ready")
except Exception as e:
    print(f"Table note: {e}")
    conn.rollback()

# Process both email accounts
EMAILS = ['tarikp@gmail.com', 'tarik@maxfieldmarket.com']
total_imported = 0
all_payments = []

for email in EMAILS:
    print(f"\n{'─' * 40}")
    print(f"Processing: {email}")
    print(f"{'─' * 40}")
    
    access_token = get_access_token(email)
    if not access_token:
        print(f"  ❌ No valid token for {email}")
        continue
    print(f"  ✓ Token acquired")
    
    for platform, queries in PAYMENT_QUERIES.items():
        all_msg_ids = set()
        for query in queries:
            messages = search_emails(access_token, query)
            for m in messages:
                all_msg_ids.add(m['id'])
        
        print(f"  {platform}: {len(all_msg_ids)} unique emails found")
        
        imported = 0
        skipped = 0
        failed = 0
        
        for msg_id in all_msg_ids:
            try:
                subject, date_str, body = get_email_content(access_token, msg_id)
                if not body:
                    failed += 1
                    continue
                
                parsed = parse_payment_with_llm(platform, subject, body, date_str)
                if not parsed or not parsed.get('isPayment'):
                    skipped += 1
                    continue
                
                recipient = parsed.get('recipientName', 'Unknown')
                amount = parsed.get('amount', 0)
                currency = parsed.get('currency', 'USD')
                note = parsed.get('note', '')
                txn_id = parsed.get('transactionId') or f"{platform}_{msg_id[:12]}"
                
                # Parse date
                pay_date = None
                date_val = parsed.get('date')
                if date_val:
                    try:
                        pay_date = datetime.strptime(date_val, '%Y-%m-%d').date()
                    except:
                        pay_date = datetime.now().date()
                else:
                    pay_date = datetime.now().date()
                
                # Check duplicate
                cur.execute("SELECT id FROM contractor_payments WHERE platform = %s AND transactionId = %s", 
                           (platform, txn_id))
                if cur.fetchone():
                    skipped += 1
                    continue
                
                cur.execute("""
                    INSERT INTO contractor_payments 
                    (userId, platform, recipientName, amount, currency, paymentDate, note, 
                     transactionId, emailAccount, gmailMessageId)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (1, platform, recipient, amount, currency or 'USD', pay_date, note, 
                      txn_id, email, msg_id))
                conn.commit()
                
                imported += 1
                all_payments.append({
                    'platform': platform, 'recipient': recipient, 
                    'amount': amount, 'date': str(pay_date), 'note': note
                })
                
            except Exception as e:
                failed += 1
                if failed <= 2:
                    print(f"    Error: {str(e)[:80]}")
            
            if (imported + skipped + failed) % 10 == 0:
                sys.stdout.flush()
        
        print(f"    → Imported: {imported}, Skipped: {skipped}, Failed: {failed}")
        total_imported += imported

# Now categorize the payments using LLM
print(f"\n{'=' * 60}")
print(f"CATEGORIZING {total_imported} PAYMENTS")
print(f"{'=' * 60}")

cur.execute("""
    SELECT id, recipientName, amount, paymentDate, note, platform
    FROM contractor_payments 
    WHERE propertyAttribution = 'unclassified'
    ORDER BY amount DESC
""")
payments = cur.fetchall()

# Process in batches of 15
BATCH_SIZE = 15
categorized = 0

for i in range(0, len(payments), BATCH_SIZE):
    batch = payments[i:i+BATCH_SIZE]
    
    payments_text = ""
    for idx, pay in enumerate(batch):
        payments_text += f"""
Payment {idx+1}:
  - Recipient: {pay['recipientName']}
  - Amount: ${pay['amount']}
  - Date: {pay['paymentDate']}
  - Note/Memo: {pay['note'] or 'None'}
  - Platform: {pay['platform']}
"""

    prompt = f"""Categorize these payments for a short-term rental property business owner.

PROPERTIES:
1. "artistes_boutique" — Kingston, Jamaica (Caribbean vacation rental)
2. "sunset_studio" — Burdett, NY (Seneca Lake area vacation rental)
3. "morabeza" — Burdett, NY (same location as Sunset Studio)

COMMON PROPERTY EXPENSES:
- Cleaning services (turnover cleaning between guests)
- Maintenance/repairs (plumbing, electrical, handyman)
- Construction/renovation work
- Landscaping/yard work
- Property management
- Laundry services

CATEGORIZATION RULES:
- If note mentions cleaning, turnover, property name → PROPERTY expense
- If note mentions Jamaica, Kingston, or Caribbean → artistes_boutique
- If note mentions Seneca, Burdett, NY, lake → sunset_studio or morabeza
- If recipient is a known contractor/cleaner → likely PROPERTY
- Personal payments (friends, family, non-property) → personal
- If unclear, mark as "needs_review"

For each payment, return JSON with key "payments" containing array of:
- id: payment number (1-indexed)
- property: "artistes_boutique" | "sunset_studio" | "morabeza" | "personal" | "needs_review"
- category: "cleaning" | "maintenance" | "construction" | "landscaping" | "management" | "laundry" | "utilities" | "personal" | "other"
- taxDeductible: true/false
- confidence: 0.0-1.0
- reasoning: brief explanation

{payments_text}

Return ONLY the JSON object."""

    try:
        resp = requests.post(
            f"{FORGE_API_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {FORGE_API_KEY}", "Content-Type": "application/json"},
            json={"messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}},
            timeout=60
        )
        
        if resp.status_code != 200:
            continue
        
        content = resp.json()['choices'][0]['message']['content']
        parsed = json.loads(content)
        results = parsed.get('payments') or parsed.get('items') or parsed.get('results') or (list(parsed.values())[0] if parsed else [])
        
        if not isinstance(results, list):
            continue
        
        for result in results:
            idx = result.get('id', 0) - 1
            if idx < 0 or idx >= len(batch):
                continue
            
            pay = batch[idx]
            property_attr = result.get('property', 'needs_review')
            category = result.get('category', 'other')
            tax_deductible = result.get('taxDeductible', False)
            confidence = result.get('confidence', 0.5)
            
            prop_map = {
                'artistes_boutique': 'artistes_boutique',
                'sunset_studio': 'sunset_studio',
                'morabeza': 'morabeza',
                'personal': 'personal',
                'needs_review': 'unclassified',
            }
            mapped_prop = prop_map.get(property_attr, 'unclassified')
            confidence_int = int(confidence * 100) if confidence <= 1 else int(confidence)
            
            cur.execute("""
                UPDATE contractor_payments 
                SET propertyAttribution = %s, expenseCategory = %s, 
                    isTaxDeductible = %s, aiConfidence = %s
                WHERE id = %s
            """, (mapped_prop, category, 1 if tax_deductible else 0, confidence_int, pay['id']))
            categorized += 1
        
        conn.commit()
        print(f"  Batch {i//BATCH_SIZE + 1}: Categorized {len(results)} payments")
        sys.stdout.flush()
        
    except Exception as e:
        print(f"  Batch error: {e}")
        conn.rollback()

# Final summary
print(f"\n{'=' * 60}")
print(f"PAYMENT SCRAPE & CATEGORIZATION COMPLETE")
print(f"{'=' * 60}")
print(f"Total payments imported: {total_imported}")
print(f"Total categorized: {categorized}")

cur.execute("""
    SELECT propertyAttribution, expenseCategory, COUNT(*) as cnt, SUM(amount) as total
    FROM contractor_payments 
    WHERE isTaxDeductible = 1
    GROUP BY propertyAttribution, expenseCategory
    ORDER BY total DESC
""")
print("\nTax Deductible Payments by Property & Category:")
for row in cur.fetchall():
    print(f"  {row['propertyAttribution']} | {row['expenseCategory']}: {row['cnt']} payments (${row['total'] or 0:,.2f})")

cur.execute("""
    SELECT YEAR(paymentDate) as yr, propertyAttribution, COUNT(*) as cnt, SUM(amount) as total
    FROM contractor_payments 
    WHERE isTaxDeductible = 1
    GROUP BY YEAR(paymentDate), propertyAttribution
    ORDER BY yr, total DESC
""")
print("\nBy Year:")
for row in cur.fetchall():
    print(f"  {row['yr']} | {row['propertyAttribution']}: {row['cnt']} payments (${row['total'] or 0:,.2f})")

# Show top recipients
cur.execute("""
    SELECT recipientName, COUNT(*) as cnt, SUM(amount) as total, 
           GROUP_CONCAT(DISTINCT propertyAttribution) as properties
    FROM contractor_payments 
    WHERE isTaxDeductible = 1
    GROUP BY recipientName
    ORDER BY total DESC
    LIMIT 15
""")
print("\nTop Contractors/Service Providers:")
for row in cur.fetchall():
    print(f"  {row['recipientName']}: {row['cnt']} payments (${row['total'] or 0:,.2f}) → {row['properties']}")

conn.close()
