"""
Scrape vendor order emails from tarik@maxfieldmarket.com only.
Uses token decryption to access Gmail API.
"""
import hashlib, base64, requests, json, time, re, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime
import subprocess

print("=" * 60)
print("VENDOR ORDER EMAIL SCRAPER — tarik@maxfieldmarket.com")
print("=" * 60)

# Config
JWT_SECRET = 'Ksf86cxXMujRRnssReDUh6'
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
FORGE_API_URL = None
FORGE_API_KEY = None

# Get env vars from running server
result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f tsx | head -1)/environ 2>/dev/null | tr "\\0" "\\n"'], 
                      capture_output=True, text=True)
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
    cur.execute("""SELECT refreshToken, scopes FROM oauth_tokens 
                   WHERE accountEmail = %s AND scopes LIKE '%%gmail.readonly%%' AND status = 'active' 
                   ORDER BY updatedAt DESC LIMIT 1""", (email,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        print(f"  No gmail.readonly token found for {email}")
        return None
    
    refresh_tok = decrypt_token(row['refreshToken'])
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_tok,
        'grant_type': 'refresh_token'
    })
    if resp.status_code == 200:
        return resp.json()['access_token']
    else:
        print(f"  Token refresh failed: {resp.status_code} - {resp.text[:100]}")
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
        if next_token:
            url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=100&pageToken={next_token}'
        else:
            break
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
    
    # Extract body
    body = ''
    payload = msg.get('payload', {})
    
    def extract_text(part):
        if part.get('mimeType') == 'text/plain' and part.get('body', {}).get('data'):
            return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
        elif part.get('mimeType') == 'text/html' and part.get('body', {}).get('data'):
            return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
        return ''
    
    if payload.get('parts'):
        for part in payload['parts']:
            text = extract_text(part)
            if text:
                body += text + '\n'
            if part.get('parts'):
                for subpart in part['parts']:
                    text = extract_text(subpart)
                    if text:
                        body += text + '\n'
    else:
        body = extract_text(payload)
    
    return subject, date_str, body[:8000]  # Limit body size

def parse_order_with_llm(vendor, subject, body, date_str):
    """Use LLM to extract order details from email"""
    prompt = f"""Extract order information from this {vendor} email. Return JSON with these fields:
- orderNumber: the order/confirmation number
- orderDate: date in YYYY-MM-DD format (from email date: {date_str})
- totalAmount: total amount as a number (no $ sign)
- currency: USD or JMD
- deliveryAddress: full delivery address if mentioned
- items: array of objects with {{name, quantity, unitPrice, asin}}

If this is NOT an order confirmation (e.g., shipping update, review request, promo), return {{"notAnOrder": true}}

Email subject: {subject}
Email body (first 4000 chars):
{body[:4000]}"""

    try:
        resp = requests.post(
            f"{FORGE_API_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {FORGE_API_KEY}", "Content-Type": "application/json"},
            json={
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            },
            timeout=30
        )
        if resp.status_code == 200:
            content = resp.json()['choices'][0]['message']['content']
            return json.loads(content)
    except Exception as e:
        pass
    return None

# Main execution
VENDORS = {
    'Amazon': 'from:auto-confirm@amazon.com after:2024/01/01',
    'Walmart': 'from:help@walmart.com subject:order after:2024/01/01',
    'Wayfair': 'from:noreply@wayfair.com after:2024/01/01',
    'Home Depot': 'from:homedepot@order.homedepot.com after:2024/01/01',
    'Lowes': 'from:lowes@email.lowes.com after:2024/01/01',
}

email = 'tarik@maxfieldmarket.com'
print(f"\nProcessing: {email}")
print("-" * 40)

access_token = get_access_token(email)
if not access_token:
    print("  ❌ Could not get access token — exiting")
    sys.exit(1)

print(f"  ✓ Token acquired (length: {len(access_token)})")

# DB connection for inserts
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

total_imported = 0
total_items = 0

for vendor, query in VENDORS.items():
    print(f"  Searching {vendor}...")
    messages = search_emails(access_token, query)
    print(f"  Found {len(messages)} emails")
    
    imported = 0
    failed = 0
    skipped = 0
    
    for i, msg in enumerate(messages):
        try:
            subject, date_str, body = get_email_content(access_token, msg['id'])
            if not body:
                failed += 1
                continue
            
            parsed = parse_order_with_llm(vendor, subject, body, date_str)
            if not parsed or parsed.get('notAnOrder'):
                skipped += 1
                continue
            
            order_number = parsed.get('orderNumber')
            if not order_number:
                failed += 1
                continue
            
            # Check for duplicate
            cur.execute("SELECT id FROM orders WHERE orderNumber = %s AND vendor = %s", (str(order_number), vendor))
            if cur.fetchone():
                skipped += 1
                continue
            
            # Parse date
            order_date = None
            date_val = parsed.get('orderDate')
            if date_val:
                try:
                    order_date = datetime.strptime(date_val, '%Y-%m-%d')
                except:
                    order_date = datetime.now()
            else:
                order_date = datetime.now()
            
            total_amount = parsed.get('totalAmount') or 0
            currency = parsed.get('currency') or 'USD'
            items_json = json.dumps(parsed.get('items', []))
            delivery_address = parsed.get('deliveryAddress', '')
            
            cur.execute("""
                INSERT INTO orders (userId, platform, orderNumber, vendor, totalAmount, currency, 
                                  status, items, importSource, orderDate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (1, vendor, str(order_number), vendor, total_amount, currency or 'USD',
                  'delivered', items_json, 'email', order_date))
            conn.commit()
            order_id = cur.lastrowid
            
            # Insert order items
            items = parsed.get('items', [])
            for item in items:
                if not item or not isinstance(item, dict):
                    continue
                name = item.get('name')
                if not name:
                    continue
                qty = item.get('quantity', 1) or 1
                price = item.get('unitPrice')
                if isinstance(price, str):
                    price = price.replace('$', '').replace(',', '').strip()
                    try:
                        price = float(price)
                    except:
                        price = None
                
                line_total = float(price) * int(qty) if price else None
                
                cur.execute("""
                    INSERT INTO order_items (orderId, name, quantity, unitPrice, lineTotal, currency,
                                            asin, deliveryAddress, propertyAttribution)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (order_id, str(name)[:500], qty, price, line_total, currency or 'USD',
                      item.get('asin'), delivery_address, 'unclassified'))
                total_items += 1
            conn.commit()
            
            imported += 1
            
        except Exception as e:
            failed += 1
            if failed <= 3:
                print(f"    Error: {e}")
        
        if (i + 1) % 10 == 0:
            print(f"    Progress: {i+1}/{len(messages)} (imported: {imported}, skipped: {skipped}, failed: {failed})")
            sys.stdout.flush()
    
    print(f"  {vendor} done: {imported} imported, {skipped} skipped, {failed} failed")
    total_imported += imported

conn.close()

print(f"\n{'=' * 60}")
print(f"SCRAPE COMPLETE — tarik@maxfieldmarket.com")
print(f"{'=' * 60}")
print(f"Total orders imported: {total_imported}")
print(f"Total items imported: {total_items}")
