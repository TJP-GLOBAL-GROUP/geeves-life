"""
Vendor Order Email Scraper v2 — with token decryption
Uses the same AES-256-GCM encryption as the Geeves server to decrypt OAuth tokens.
"""
import mysql.connector
import json
import requests
import time
import base64
import re
import hashlib
from urllib.parse import urlparse
from datetime import datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ─── CONFIG ───────────────────────────────────────────────────────────────────
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
JWT_SECRET = "Ksf86cxXMujRRnssReDUh6"
GOOGLE_CLIENT_ID = None
GOOGLE_CLIENT_SECRET = None

# Get Google OAuth credentials from server env
import subprocess
result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f "tsx" | head -1)/environ 2>/dev/null | tr "\\0" "\\n" | grep -E "GOOGLE_CLIENT_(ID|SECRET)|BUILT_IN_FORGE_API"'], capture_output=True, text=True)
LLM_URL = ""
LLM_KEY = ""
for line in result.stdout.strip().split('\n'):
    if line.startswith("GOOGLE_CLIENT_ID="):
        GOOGLE_CLIENT_ID = line.split("=", 1)[1]
    elif line.startswith("GOOGLE_CLIENT_SECRET="):
        GOOGLE_CLIENT_SECRET = line.split("=", 1)[1]
    elif line.startswith("BUILT_IN_FORGE_API_URL="):
        LLM_URL = line.split("=", 1)[1]
    elif line.startswith("BUILT_IN_FORGE_API_KEY="):
        LLM_KEY = line.split("=", 1)[1]

# ─── TOKEN DECRYPTION ─────────────────────────────────────────────────────────
def decrypt_token(stored):
    """Decrypt AES-256-GCM encrypted token (matches server/tokenEncryption.ts)"""
    if not stored:
        return None
    if not stored.startswith("enc:"):
        return stored  # Legacy plaintext
    try:
        key = hashlib.sha256(JWT_SECRET.encode()).digest()
        combined = base64.b64decode(stored[4:])
        iv = combined[:12]
        auth_tag = combined[12:28]
        ciphertext = combined[28:]
        # AES-GCM: ciphertext + tag concatenated for AESGCM
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
        return plaintext.decode('utf-8')
    except Exception as e:
        print(f"  Decryption failed: {e}")
        return None

# ─── DATABASE ─────────────────────────────────────────────────────────────────
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# ─── GMAIL API ────────────────────────────────────────────────────────────────
GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

def refresh_google_token(encrypted_refresh_token, email_address):
    """Decrypt and refresh a Google OAuth token"""
    refresh_tok = decrypt_token(encrypted_refresh_token)
    if not refresh_tok:
        print(f"  Could not decrypt refresh token for {email_address}")
        return None
    
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_tok,
        "grant_type": "refresh_token"
    })
    if resp.status_code == 200:
        data = resp.json()
        return data.get("access_token")
    else:
        print(f"  Token refresh failed for {email_address}: {resp.status_code} {resp.text[:200]}")
        return None

def get_gmail_token(email_address):
    """Get a valid Gmail access token for the given email address"""
    cur.execute("""
        SELECT accessToken, refreshToken, expiresAt 
        FROM oauth_tokens 
        WHERE accountEmail = %s AND provider = 'google'
          AND scopes LIKE '%%gmail.readonly%%'
          AND status = 'active'
        ORDER BY updatedAt DESC LIMIT 1
    """, (email_address,))
    token = cur.fetchone()
    if not token:
        print(f"  No gmail.readonly token found for {email_address}")
        return None
    
    # Check if access token is still valid
    expires_at = token['expiresAt']
    now_ms = int(time.time() * 1000)
    if expires_at and int(expires_at) > now_ms + 60000:
        # Token might still be valid, try decrypting access token
        access_tok = decrypt_token(token['accessToken'])
        if access_tok:
            return access_tok
    
    # Need to refresh
    if token['refreshToken']:
        return refresh_google_token(token['refreshToken'], email_address)
    
    return None

def gmail_get(path, access_token):
    """Make a Gmail API request"""
    resp = requests.get(f"{GMAIL_BASE}{path}", headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code == 401:
        raise Exception("401_expired")
    if resp.status_code != 200:
        raise Exception(f"Gmail API {resp.status_code}: {resp.text[:300]}")
    return resp.json()

def search_emails(access_token, query, max_results=500):
    """Search Gmail for emails matching query, return message IDs"""
    messages = []
    page_token = None
    while True:
        path = f"/messages?q={requests.utils.quote(query)}&maxResults=100"
        if page_token:
            path += f"&pageToken={page_token}"
        data = gmail_get(path, access_token)
        msgs = data.get("messages", [])
        messages.extend(msgs)
        if len(messages) >= max_results:
            break
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return messages[:max_results]

def get_email_content(access_token, msg_id):
    """Get email subject, date, and body text"""
    data = gmail_get(f"/messages/{msg_id}?format=full", access_token)
    headers = {h['name'].lower(): h['value'] for h in data.get('payload', {}).get('headers', [])}
    subject = headers.get('subject', '')
    date_str = headers.get('date', '')
    from_addr = headers.get('from', '')
    body = extract_body(data.get('payload', {}))
    return {
        'id': msg_id,
        'subject': subject,
        'date': date_str,
        'from': from_addr,
        'body': body[:8000],
        'snippet': data.get('snippet', '')
    }

def extract_body(payload):
    """Extract plain text body from email payload"""
    body_text = ""
    if payload.get('mimeType') == 'text/plain' and payload.get('body', {}).get('data'):
        body_text = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
    elif payload.get('mimeType') == 'text/html' and payload.get('body', {}).get('data'):
        html = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
        body_text = re.sub(r'<[^>]+>', ' ', html)
        body_text = re.sub(r'\s+', ' ', body_text).strip()
    elif payload.get('parts'):
        for part in payload['parts']:
            result = extract_body(part)
            if result:
                body_text = result
                if part.get('mimeType') == 'text/plain':
                    break
    return body_text

# ─── LLM PARSING ─────────────────────────────────────────────────────────────
def invoke_llm(messages):
    """Call the built-in LLM API"""
    payload = {
        "model": "anthropic/claude-sonnet-4-20250514",
        "messages": messages,
        "max_tokens": 4000,
    }
    resp = requests.post(
        f"{LLM_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {LLM_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=60
    )
    resp.raise_for_status()
    return resp.json()

def parse_order_with_llm(email_data, vendor):
    """Use LLM to extract order details from email"""
    prompt = f"""Parse this {vendor} order confirmation email and extract structured data.

Email Subject: {email_data['subject']}
Email Date: {email_data['date']}
Email Body (truncated):
{email_data['body'][:6000]}

Extract the following as JSON:
- orderNumber: The order/confirmation number (string)
- orderDate: ISO date string (YYYY-MM-DD)
- deliveryAddress: Full delivery address if visible (string or null)
- totalAmount: Total order amount as a number (no $ sign)
- currency: "USD" or "JMD"
- tax: Tax amount if shown (number or null)
- shipping: Shipping cost if shown (number or null)
- items: Array of items, each with:
  - name: Product name (string)
  - quantity: Number ordered (integer)
  - unitPrice: Price per item (number, no $, or null if not shown)
  - asin: Amazon ASIN if visible (string or null)

If you cannot extract certain fields, use null. 
IMPORTANT: Return ONLY valid JSON, no markdown code fences or explanation."""

    response = invoke_llm([
        {"role": "system", "content": "You are a precise data extraction assistant. Return only valid JSON, no markdown."},
        {"role": "user", "content": prompt}
    ])
    
    content = response['choices'][0]['message']['content'].strip()
    if content.startswith('```'):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"    LLM parse failed: {e}")
        return None

def insert_order_and_items(parsed, email_data, vendor, email_account):
    """Insert parsed order into orders and order_items tables"""
    if not parsed or not parsed.get('orderNumber'):
        return False
    
    order_number = str(parsed['orderNumber'])
    
    # Check if order already exists
    cur.execute("SELECT id FROM orders WHERE orderNumber = %s AND platform = %s", (order_number, vendor))
    existing = cur.fetchone()
    if existing:
        cur.execute("SELECT COUNT(*) as cnt FROM order_items WHERE orderId = %s", (existing['id'],))
        item_count = cur.fetchone()['cnt']
        if item_count > 0:
            return False  # Already fully imported
        order_id = existing['id']
    else:
        # Parse order date
        order_date = None
        if parsed.get('orderDate'):
            try:
                order_date = datetime.fromisoformat(parsed['orderDate'])
            except:
                pass
        if not order_date:
            try:
                from email.utils import parsedate_to_datetime
                order_date = parsedate_to_datetime(email_data['date'])
            except:
                order_date = datetime.now()
        
        total = parsed.get('totalAmount') or 0
        currency = parsed.get('currency', 'USD')
        items_json = json.dumps(parsed.get('items', []))
        
        cur.execute("""
            INSERT INTO orders (userId, platform, orderNumber, vendor, totalAmount, currency, 
                              status, items, importSource, orderDate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            1, vendor, order_number, vendor, total, currency,
            'delivered', items_json, 'email', order_date
        ))
        conn.commit()
        order_id = cur.lastrowid
    
    # Insert order items
    items = parsed.get('items', [])
    delivery_address = parsed.get('deliveryAddress')
    
    for item in items:
        if not item.get('name'):
            continue
        qty = item.get('quantity', 1) or 1
        unit_price = item.get('unitPrice')
        line_total = float(unit_price) * qty if unit_price else None
        
        cur.execute("""
            INSERT INTO order_items (orderId, name, quantity, unitPrice, lineTotal, currency,
                                    vendorProductId, asin, deliveryAddress, propertyAttribution)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            order_id,
            item['name'][:500],
            qty,
            unit_price,
            line_total,
            parsed.get('currency', 'USD'),
            None,
            item.get('asin'),
            delivery_address,
            'unclassified'
        ))
    
    conn.commit()
    return True

# ─── MAIN EXECUTION ──────────────────────────────────────────────────────────
VENDOR_QUERIES = {
    'Amazon': '(from:auto-confirm@amazon.com OR from:ship-confirm@amazon.com OR from:digital-no-reply@amazon.com) subject:(order) after:2024/01/01',
    'Walmart': '(from:help@walmart.com OR from:no-reply@walmart.com) subject:(order OR confirmation) after:2024/01/01',
    'Wayfair': '(from:service@email.wayfair.com OR from:noreply@wayfair.com) subject:(order OR confirmation) after:2024/01/01',
    'Home Depot': '(from:homedepot@email.homedepot.com OR from:no-reply@homedepot.com) subject:(order) after:2024/01/01',
    'Lowes': '(from:Lowes@e.lowes.com OR from:lowes@lowes.com) subject:(order) after:2024/01/01',
}

EMAIL_ACCOUNTS = ['tarikp@gmail.com', 'tarik@maxfieldmarket.com']

print("=" * 60)
print("VENDOR ORDER EMAIL SCRAPER v2 (with token decryption)")
print("=" * 60)
print(f"Searching from Jan 1, 2024 to present")
print(f"Vendors: {', '.join(VENDOR_QUERIES.keys())}")
print(f"Email accounts: {', '.join(EMAIL_ACCOUNTS)}")
print()

total_orders_found = 0
total_orders_imported = 0
total_items_imported = 0

for email_account in EMAIL_ACCOUNTS:
    print(f"\n{'─' * 40}")
    print(f"Processing: {email_account}")
    print(f"{'─' * 40}")
    
    access_token = get_gmail_token(email_account)
    if not access_token:
        print(f"  ❌ No valid token for {email_account} — skipping")
        continue
    
    print(f"  ✓ Token acquired (length: {len(access_token)})")
    
    for vendor, query in VENDOR_QUERIES.items():
        print(f"\n  Searching {vendor}...")
        try:
            messages = search_emails(access_token, query)
            print(f"  Found {len(messages)} emails")
            total_orders_found += len(messages)
            
            imported = 0
            skipped = 0
            failed = 0
            
            for i, msg in enumerate(messages):
                if i > 0 and i % 10 == 0:
                    print(f"    Progress: {i}/{len(messages)} (imported: {imported}, skipped: {skipped}, failed: {failed})")
                
                try:
                    email_data = get_email_content(access_token, msg['id'])
                    
                    # Skip non-order emails
                    subject_lower = email_data['subject'].lower()
                    if any(skip in subject_lower for skip in ['rate your', 'review your', 'how was', 'feedback', 'return label', 'refund processed']):
                        skipped += 1
                        continue
                    
                    parsed = parse_order_with_llm(email_data, vendor)
                    if parsed and parsed.get('orderNumber'):
                        success = insert_order_and_items(parsed, email_data, vendor, email_account)
                        if success:
                            imported += 1
                            items_count = len(parsed.get('items', []))
                            total_items_imported += items_count
                        else:
                            skipped += 1
                    else:
                        failed += 1
                    
                    # Rate limit for LLM
                    time.sleep(0.3)
                    
                except Exception as e:
                    err_str = str(e)
                    if "401_expired" in err_str:
                        print(f"    Token expired — refreshing...")
                        access_token = get_gmail_token(email_account)
                        if not access_token:
                            print(f"    ❌ Could not refresh — stopping {vendor}")
                            break
                        # Retry this message
                        try:
                            email_data = get_email_content(access_token, msg['id'])
                            parsed = parse_order_with_llm(email_data, vendor)
                            if parsed and parsed.get('orderNumber'):
                                success = insert_order_and_items(parsed, email_data, vendor, email_account)
                                if success:
                                    imported += 1
                                    total_items_imported += len(parsed.get('items', []))
                                else:
                                    skipped += 1
                        except:
                            failed += 1
                    elif "429" in err_str:
                        print(f"    Rate limited — waiting 30s...")
                        time.sleep(30)
                    else:
                        failed += 1
                        if failed <= 3:
                            print(f"    Error: {err_str[:100]}")
            
            total_orders_imported += imported
            print(f"  {vendor} done: {imported} imported, {skipped} skipped, {failed} failed")
            
        except Exception as e:
            print(f"  ❌ Error searching {vendor}: {str(e)[:200]}")

print(f"\n{'=' * 60}")
print(f"SCRAPE COMPLETE")
print(f"{'=' * 60}")
print(f"Total emails found: {total_orders_found}")
print(f"Total orders imported: {total_orders_imported}")
print(f"Total items imported: {total_items_imported}")

# Summary
cur.execute("SELECT platform, COUNT(*) as cnt, SUM(totalAmount) as total FROM orders GROUP BY platform")
print(f"\nOrders in database:")
for row in cur.fetchall():
    print(f"  {row['platform']}: {row['cnt']} orders, ${row['total'] or 0:.2f}")

cur.execute("SELECT COUNT(*) as cnt FROM order_items")
print(f"\nTotal order items: {cur.fetchone()['cnt']}")

cur.execute("SELECT COUNT(*) as cnt FROM order_items WHERE deliveryAddress LIKE '%Aeropost%' OR deliveryAddress LIKE '%3024 Braxton%'")
print(f"Items with Jamaica/property delivery address: {cur.fetchone()['cnt']}")

conn.close()
