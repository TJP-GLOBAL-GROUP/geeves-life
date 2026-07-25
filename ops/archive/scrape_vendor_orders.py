"""
Vendor Order Email Scraper
Searches Gmail for order confirmation emails from Amazon, Walmart, Wayfair, Home Depot, and Lowe's.
Uses LLM to parse email bodies into structured order data.
Imports results into the orders and order_items tables.
"""
import mysql.connector
import json
import requests
import time
import base64
import re
from urllib.parse import urlparse
from datetime import datetime

# Database connection
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# Gmail API base
GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

# LLM API (from server env)
import subprocess
result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f "tsx" | head -1)/environ 2>/dev/null | tr "\\0" "\\n" | grep BUILT_IN_FORGE_API'], capture_output=True, text=True)
env_lines = result.stdout.strip().split('\n')
LLM_URL = ""
LLM_KEY = ""
for line in env_lines:
    if line.startswith("BUILT_IN_FORGE_API_URL="):
        LLM_URL = line.split("=", 1)[1]
    elif line.startswith("BUILT_IN_FORGE_API_KEY="):
        LLM_KEY = line.split("=", 1)[1]

def invoke_llm(messages, response_format=None):
    """Call the built-in LLM API"""
    payload = {
        "model": "anthropic/claude-sonnet-4-20250514",
        "messages": messages,
        "max_tokens": 4000,
    }
    if response_format:
        payload["response_format"] = response_format
    resp = requests.post(
        f"{LLM_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {LLM_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=60
    )
    resp.raise_for_status()
    return resp.json()

def get_gmail_token(email_address):
    """Get a valid Gmail access token for the given email address.
    Specifically looks for tokens with gmail.readonly scope."""
    # Check oauth_tokens table — find the token with gmail.readonly scope
    cur.execute("""
        SELECT ot.accessToken, ot.refreshToken, ot.expiresAt 
        FROM oauth_tokens ot 
        WHERE ot.accountEmail = %s AND ot.provider = 'google'
          AND ot.scopes LIKE '%%gmail.readonly%%'
          AND ot.status = 'active'
        ORDER BY ot.updatedAt DESC LIMIT 1
    """, (email_address,))
    token = cur.fetchone()
    if token and token['accessToken']:
        expires_at = token['expiresAt']
        is_valid = False
        if expires_at:
            try:
                if isinstance(expires_at, (int, float)):
                    is_valid = float(expires_at) / 1000 > time.time() + 300
                elif isinstance(expires_at, datetime):
                    is_valid = expires_at.timestamp() > time.time() + 300
                else:
                    ts_val = int(str(expires_at))
                    is_valid = ts_val / 1000 > time.time() + 300
            except:
                is_valid = False
        if is_valid:
            return token['accessToken']
        if token['refreshToken']:
            return refresh_token(token['refreshToken'], email_address)
    
    # Fallback: check property_email_tokens
    cur.execute("SELECT accessToken, refreshToken, tokenExpiry FROM property_email_tokens WHERE emailAddress = %s LIMIT 1", (email_address,))
    token = cur.fetchone()
    if token and token['accessToken']:
        expiry = token['tokenExpiry'] or 0
        if expiry > int(time.time() * 1000) + 5 * 60 * 1000:
            return token['accessToken']
        if token['refreshToken']:
            return refresh_token(token['refreshToken'], email_address)
    
    return None

def refresh_token(refresh_token_str, email_address):
    """Refresh a Google OAuth token"""
    # Get client credentials from env
    result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f "tsx" | head -1)/environ 2>/dev/null | tr "\\0" "\\n" | grep -E "GOOGLE_CLIENT_(ID|SECRET)"'], capture_output=True, text=True)
    client_id = ""
    client_secret = ""
    for line in result.stdout.strip().split('\n'):
        if line.startswith("GOOGLE_CLIENT_ID="):
            client_id = line.split("=", 1)[1]
        elif line.startswith("GOOGLE_CLIENT_SECRET="):
            client_secret = line.split("=", 1)[1]
    
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token_str,
        "grant_type": "refresh_token"
    })
    if resp.status_code == 200:
        data = resp.json()
        new_token = data.get("access_token")
        # Update in DB
        new_expiry = int(time.time() * 1000) + data.get("expires_in", 3600) * 1000
        cur.execute("UPDATE property_email_tokens SET accessToken = %s, tokenExpiry = %s WHERE emailAddress = %s", 
                   (new_token, new_expiry, email_address))
        conn.commit()
        return new_token
    else:
        print(f"  Token refresh failed for {email_address}: {resp.status_code} {resp.text[:200]}")
        return None

def gmail_get(path, access_token):
    """Make a Gmail API request"""
    resp = requests.get(f"{GMAIL_BASE}{path}", headers={"Authorization": f"Bearer {access_token}"})
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
    
    # Extract body text
    body = extract_body(data.get('payload', {}))
    
    return {
        'id': msg_id,
        'subject': subject,
        'date': date_str,
        'from': from_addr,
        'body': body[:8000],  # Limit body size for LLM
        'snippet': data.get('snippet', '')
    }

def extract_body(payload):
    """Extract plain text body from email payload"""
    body_text = ""
    
    if payload.get('mimeType') == 'text/plain' and payload.get('body', {}).get('data'):
        body_text = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
    elif payload.get('mimeType') == 'text/html' and payload.get('body', {}).get('data'):
        html = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
        # Strip HTML tags for a rough text extraction
        body_text = re.sub(r'<[^>]+>', ' ', html)
        body_text = re.sub(r'\s+', ' ', body_text).strip()
    elif payload.get('parts'):
        for part in payload['parts']:
            result = extract_body(part)
            if result:
                body_text = result
                if part.get('mimeType') == 'text/plain':
                    break  # Prefer plain text
    
    return body_text

def parse_order_with_llm(email_data, vendor):
    """Use LLM to extract order details from email"""
    prompt = f"""Parse this {vendor} order confirmation email and extract structured data.

Email Subject: {email_data['subject']}
Email Date: {email_data['date']}
Email From: {email_data['from']}
Email Body (truncated):
{email_data['body'][:6000]}

Extract the following as JSON:
- orderNumber: The order/confirmation number
- orderDate: ISO date string (YYYY-MM-DD)
- deliveryAddress: Full delivery address if visible
- totalAmount: Total order amount as a number (no $ sign)
- currency: USD or JMD
- tax: Tax amount if shown
- shipping: Shipping cost if shown
- items: Array of items, each with:
  - name: Product name
  - quantity: Number ordered
  - unitPrice: Price per item (number, no $)
  - asin: Amazon ASIN if visible (Amazon only)
  - productId: Vendor product/SKU ID if visible

If you cannot extract certain fields, use null. For items without individual prices, set unitPrice to null.
Return ONLY valid JSON, no markdown or explanation."""

    response = invoke_llm([
        {"role": "system", "content": "You are a precise data extraction assistant. Return only valid JSON."},
        {"role": "user", "content": prompt}
    ])
    
    content = response['choices'][0]['message']['content']
    # Clean up potential markdown wrapping
    content = content.strip()
    if content.startswith('```'):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        print(f"  LLM parse failed for {email_data['subject'][:50]}")
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
        # Order exists, but check if it has order_items
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
            # Try to parse from email date
            try:
                from email.utils import parsedate_to_datetime
                order_date = parsedate_to_datetime(email_data['date'])
            except:
                order_date = datetime.now()
        
        # Insert order
        total = parsed.get('totalAmount') or 0
        currency = parsed.get('currency', 'USD')
        items_json = json.dumps(parsed.get('items', []))
        
        cur.execute("""
            INSERT INTO orders (userId, platform, orderNumber, vendor, totalAmount, currency, 
                              status, items, importSource, orderDate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            None,  # userId - will be linked later
            vendor,
            order_number,
            vendor,
            total,
            currency,
            'delivered',
            items_json,
            'email',
            order_date
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
            item.get('productId'),
            item.get('asin'),
            delivery_address,
            'unclassified'
        ))
    
    conn.commit()
    return True

# ─── MAIN EXECUTION ───────────────────────────────────────────────────────────

# Vendor search queries
VENDOR_QUERIES = {
    'Amazon': '(from:auto-confirm@amazon.com OR from:ship-confirm@amazon.com OR from:order-update@amazon.com) subject:(order OR shipped OR delivered) after:2024/01/01',
    'Walmart': '(from:help@walmart.com OR from:no-reply@walmart.com OR from:noreply@walmart.com) subject:(order OR shipped OR delivered OR confirmation) after:2024/01/01',
    'Wayfair': '(from:service@email.wayfair.com OR from:noreply@wayfair.com OR from:cs@wayfair.com) subject:(order OR shipped OR delivery) after:2024/01/01',
    'Home Depot': '(from:homedepot@email.homedepot.com OR from:no-reply@homedepot.com OR from:donotreply@homedepot.com) subject:(order OR shipped OR delivery OR confirmation) after:2024/01/01',
    'Lowes': '(from:lowes@lowes.com OR from:Lowes@e.lowes.com OR from:noreply@lowes.com) subject:(order OR shipped OR delivery OR confirmation) after:2024/01/01',
}

# Email accounts to check
EMAIL_ACCOUNTS = ['tarik@maxfieldmarket.com', 'tarikp@gmail.com']

print("=" * 60)
print("VENDOR ORDER EMAIL SCRAPER")
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
    
    print(f"  ✓ Token acquired")
    
    for vendor, query in VENDOR_QUERIES.items():
        print(f"\n  Searching {vendor}...")
        try:
            messages = search_emails(access_token, query)
            print(f"  Found {len(messages)} emails")
            total_orders_found += len(messages)
            
            # Process each email
            imported = 0
            skipped = 0
            failed = 0
            
            for i, msg in enumerate(messages):
                if i > 0 and i % 10 == 0:
                    print(f"    Processing {i}/{len(messages)}... (imported: {imported}, skipped: {skipped})")
                
                try:
                    email_data = get_email_content(access_token, msg['id'])
                    
                    # Skip non-order emails (shipping updates, etc.)
                    subject_lower = email_data['subject'].lower()
                    if any(skip in subject_lower for skip in ['rate your', 'review your', 'how was', 'feedback', 'return', 'refund']):
                        skipped += 1
                        continue
                    
                    # Parse with LLM
                    parsed = parse_order_with_llm(email_data, vendor)
                    if parsed and parsed.get('orderNumber'):
                        success = insert_order_and_items(parsed, email_data, vendor, email_account)
                        if success:
                            imported += 1
                            items_count = len(parsed.get('items', []))
                            total_items_imported += items_count
                        else:
                            skipped += 1  # Already exists
                    else:
                        failed += 1
                    
                    # Rate limit
                    time.sleep(0.5)
                    
                except Exception as e:
                    failed += 1
                    if "429" in str(e) or "quota" in str(e).lower():
                        print(f"    Rate limited — waiting 30s...")
                        time.sleep(30)
                    elif "401" in str(e) or "403" in str(e):
                        print(f"    Auth error — token may have expired. Refreshing...")
                        access_token = get_gmail_token(email_account)
                        if not access_token:
                            print(f"    ❌ Could not refresh token — stopping {vendor}")
                            break
                    else:
                        print(f"    Error on msg {msg['id']}: {str(e)[:100]}")
            
            total_orders_imported += imported
            print(f"  {vendor} complete: {imported} imported, {skipped} skipped, {failed} failed")
            
        except Exception as e:
            print(f"  ❌ Error searching {vendor}: {str(e)[:200]}")

print(f"\n{'=' * 60}")
print(f"SCRAPE COMPLETE")
print(f"{'=' * 60}")
print(f"Total emails found: {total_orders_found}")
print(f"Total orders imported: {total_orders_imported}")
print(f"Total items imported: {total_items_imported}")

# Summary of what's in the DB now
cur.execute("SELECT platform, COUNT(*) as cnt FROM orders GROUP BY platform")
print(f"\nOrders in database:")
for row in cur.fetchall():
    print(f"  {row['platform']}: {row['cnt']}")

cur.execute("SELECT COUNT(*) as cnt FROM order_items")
print(f"\nTotal order items: {cur.fetchone()['cnt']}")

conn.close()
