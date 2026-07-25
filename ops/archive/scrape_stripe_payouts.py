"""
Search all connected Gmail accounts for Stripe payout emails
related to Artiste's Boutique / Booking.com income.
"""
import json, os, re, base64, requests
from datetime import datetime
from pathlib import Path

tokens_file = '/home/ubuntu/upload/all_gmail_tokens.json'
with open(tokens_file) as f:
    tokens_data = json.load(f)

# tokens_data is a dict keyed by email -> access_token string
if isinstance(tokens_data, list):
    accounts = tokens_data
else:
    accounts = [{'email': email, 'access_token': token_str} 
                for email, token_str in tokens_data.items()]
print(f"Loaded {len(accounts)} Gmail accounts")

output_dir = Path('/home/ubuntu/upload/stripe_payouts')
output_dir.mkdir(exist_ok=True)

all_stripe = []

STRIPE_QUERIES = [
    'from:stripe.com payout',
    'from:stripe.com "your payout"',
    'from:stripe.com "has been sent"',
    'from:stripe.com "transfer"',
    'from:no-reply@stripe.com',
    'from:support@stripe.com payout',
    'subject:"stripe" payout',
    'subject:"stripe" deposit',
    'stripe payout artiste',
    'stripe payout boutique',
    '"stripe" "payout" "USD"',
]

def search_gmail(token, query, max_results=50):
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    params = {'q': query, 'maxResults': max_results}
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.get(url, params=params, headers=headers, timeout=15)
    if r.status_code != 200:
        return []
    return r.json().get('messages', [])

def get_message(token, msg_id):
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    params = {'format': 'full'}
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.get(url, params=params, headers=headers, timeout=15)
    if r.status_code != 200:
        return None
    return r.json()

def extract_body(msg):
    """Extract plain text or HTML body from Gmail message."""
    payload = msg.get('payload', {})
    parts = payload.get('parts', [])
    body_data = ''
    
    def get_parts(p):
        nonlocal body_data
        if p.get('mimeType') == 'text/plain':
            data = p.get('body', {}).get('data', '')
            if data:
                body_data += base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
        elif p.get('mimeType') == 'text/html' and not body_data:
            data = p.get('body', {}).get('data', '')
            if data:
                html = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
                # Strip HTML tags
                body_data += re.sub(r'<[^>]+>', ' ', html)
        for sub in p.get('parts', []):
            get_parts(sub)
    
    if parts:
        for p in parts:
            get_parts(p)
    else:
        data = payload.get('body', {}).get('data', '')
        if data:
            body_data = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
    
    return body_data[:3000]

def extract_amount(text):
    """Extract USD amount from Stripe payout email."""
    patterns = [
        r'\$\s*([\d,]+\.?\d*)\s*USD',
        r'USD\s*\$?\s*([\d,]+\.?\d*)',
        r'([\d,]+\.\d{2})\s*USD',
        r'\$\s*([\d,]+\.\d{2})',
        r'amount[:\s]+\$?\s*([\d,]+\.?\d*)',
        r'payout[:\s]+\$?\s*([\d,]+\.?\d*)',
        r'([\d,]+\.\d{2})',
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            try:
                val = float(m.group(1).replace(',', ''))
                if 1 < val < 100000:
                    return val
            except:
                pass
    return 0

seen_ids = set()

for acct in accounts:
    email = acct.get('email', '')
    token = acct.get('access_token', '')
    if not token:
        print(f"  {email}: no token, skipping")
        continue
    
    print(f"\n=== Searching {email} for Stripe payouts ===")
    found_ids = set()
    
    for query in STRIPE_QUERIES:
        try:
            msgs = search_gmail(token, query, max_results=100)
            for m in msgs:
                found_ids.add(m['id'])
        except Exception as e:
            print(f"  Query '{query}': error {e}")
    
    print(f"  Found {len(found_ids)} unique Stripe-related message IDs")
    
    for msg_id in list(found_ids)[:200]:
        if msg_id in seen_ids:
            continue
        seen_ids.add(msg_id)
        
        try:
            msg = get_message(token, msg_id)
            if not msg:
                continue
            
            headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
            subject = headers.get('subject', '')
            sender = headers.get('from', '')
            date_str = headers.get('date', '')
            internal_date = int(msg.get('internalDate', 0)) / 1000
            date = datetime.fromtimestamp(internal_date).strftime('%Y-%m-%d') if internal_date else ''
            
            # Only keep 2024-2026
            year = date[:4] if date else ''
            if year not in ('2024', '2025', '2026'):
                continue
            
            body = extract_body(msg)
            amount = extract_amount(body + ' ' + subject)
            
            # Check if it's a real payout (not a receipt or charge)
            combined = (subject + ' ' + body[:500]).lower()
            is_payout = any(kw in combined for kw in [
                'payout', 'has been sent', 'transfer to your bank', 'deposited',
                'bank account', 'your payout', 'payment sent', 'funds sent',
                'transfer initiated', 'transfer complete'
            ])
            is_charge = any(kw in combined for kw in [
                'receipt for your payment', 'you paid', 'charge', 'invoice',
                'subscription', 'plan', 'upgrade', 'fee'
            ])
            
            record = {
                'id': msg_id,
                'account': email,
                'date': date,
                'year': year,
                'subject': subject,
                'sender': sender,
                'amount_usd': amount,
                'is_payout': is_payout,
                'is_charge': is_charge,
                'body_preview': body[:400],
            }
            all_stripe.append(record)
            
            if is_payout and not is_charge:
                print(f"  PAYOUT: {date} ${amount} | {subject[:80]}")
        
        except Exception as e:
            pass

# Save all results
with open('/home/ubuntu/upload/stripe_results.json', 'w') as f:
    json.dump(all_stripe, f, indent=2)

# Summary
payouts = [r for r in all_stripe if r['is_payout'] and not r['is_charge'] and r['amount_usd'] > 0]
print(f"\n=== STRIPE PAYOUT SUMMARY ===")
print(f"Total Stripe emails found: {len(all_stripe)}")
print(f"Confirmed payouts with amounts: {len(payouts)}")
by_year = {}
for p in payouts:
    y = p['year']
    by_year.setdefault(y, []).append(p)
for y in sorted(by_year):
    total = sum(p['amount_usd'] for p in by_year[y])
    print(f"  {y}: {len(by_year[y])} payouts, total ${total:.2f}")
