#!/usr/bin/env python3
"""
Scrape all VRBO and Booking.com income emails across all connected Gmail accounts
for Artiste's Boutique - years 2023, 2024, 2025, 2026.
"""
import json, os, re, base64, requests, time
from pathlib import Path
from datetime import datetime
from fpdf import FPDF

TOKENS_FILE = '/home/ubuntu/upload/all_gmail_tokens.json'
OUTPUT_DIR = Path('/home/ubuntu/upload/vrbo_booking_emails')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

with open(TOKENS_FILE) as f:
    tokens = json.load(f)

ACCOUNTS = list(tokens.keys())
print(f"Searching {len(ACCOUNTS)} accounts: {ACCOUNTS}")

# Search queries for VRBO and Booking.com
SEARCH_QUERIES = [
    # VRBO queries
    ('vrbo', 'vrbo payout OR vrbo payment OR vrbo reservation OR vrbo booking OR vrbo deposit'),
    ('vrbo_homeaway', 'homeaway payout OR homeaway payment OR homeaway reservation'),
    ('vrbo_vrbo', 'from:vrbo.com'),
    ('vrbo_homeaway2', 'from:homeaway.com'),
    ('vrbo_expedia', 'from:expediagroup.com vrbo OR homeaway'),
    # Booking.com queries
    ('booking_payout', 'booking.com payout OR booking.com payment'),
    ('booking_reservation', 'booking.com reservation OR booking.com booking'),
    ('booking_from', 'from:booking.com'),
    ('booking_noreply', 'from:noreply@booking.com OR from:partner@booking.com'),
    # General STR platform queries
    ('tripadvisor', 'from:tripadvisor.com OR tripadvisor rental payout'),
    ('flipkey', 'from:flipkey.com OR flipkey rental payout'),
    ('houfy', 'from:houfy.com'),
    ('direct_booking', '"7 dillsbury" OR "artiste boutique" OR "artistes boutique" booking payment'),
]

def gmail_search(token, query, max_results=100):
    """Search Gmail for messages matching query."""
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    headers = {'Authorization': f'Bearer {token}'}
    params = {'q': query, 'maxResults': max_results}
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code == 401:
        return None, 'expired'
    if resp.status_code != 200:
        return [], f'error_{resp.status_code}'
    data = resp.json()
    return data.get('messages', []), 'ok'

def get_message(token, msg_id):
    """Get full message details."""
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    headers = {'Authorization': f'Bearer {token}'}
    params = {'format': 'full'}
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        return None
    return resp.json()

def extract_body(msg):
    """Extract text body from Gmail message."""
    def get_parts(payload):
        parts = []
        if payload.get('mimeType') == 'text/plain':
            data = payload.get('body', {}).get('data', '')
            if data:
                parts.append(base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace'))
        elif payload.get('mimeType') == 'text/html':
            data = payload.get('body', {}).get('data', '')
            if data:
                html = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
                # Strip HTML tags
                text = re.sub(r'<[^>]+>', ' ', html)
                text = re.sub(r'\s+', ' ', text)
                parts.append(text)
        for part in payload.get('parts', []):
            parts.extend(get_parts(part))
        return parts
    
    parts = get_parts(msg.get('payload', {}))
    return '\n'.join(parts)[:5000]

def get_headers(msg):
    """Extract headers from Gmail message."""
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']
    return headers

def parse_amount(text):
    """Extract monetary amount from text."""
    # Look for USD amounts
    usd_patterns = [
        r'USD\s*\$?([\d,]+\.?\d*)',
        r'\$\s*([\d,]+\.?\d*)\s*USD',
        r'US\$\s*([\d,]+\.?\d*)',
        r'payout[^\$]*\$\s*([\d,]+\.?\d*)',
        r'payment[^\$]*\$\s*([\d,]+\.?\d*)',
        r'deposit[^\$]*\$\s*([\d,]+\.?\d*)',
        r'total[^\$]*\$\s*([\d,]+\.?\d*)',
        r'\$\s*([\d,]+\.?\d*)',
    ]
    for pattern in usd_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                amt = float(m.group(1).replace(',', ''))
                if 10 <= amt <= 50000:  # Reasonable range for STR payouts
                    return amt
            except:
                pass
    return 0

def parse_date_from_email(headers, msg):
    """Extract date from email headers."""
    date_str = headers.get('date', '')
    # Try internal date
    internal_date = msg.get('internalDate', '0')
    if internal_date:
        ts = int(internal_date) / 1000
        return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
    return ''

def create_pdf(filename, subject, sender, date, body, account):
    """Create a PDF from email content."""
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 14)
        # Clean text for latin-1
        def clean(t):
            return t.encode('latin-1', errors='replace').decode('latin-1')
        pdf.cell(0, 10, clean(f"Email Evidence: {subject[:60]}"), ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.cell(0, 6, clean(f"From: {sender}"), ln=True)
        pdf.cell(0, 6, clean(f"Date: {date}"), ln=True)
        pdf.cell(0, 6, clean(f"Account: {account}"), ln=True)
        pdf.ln(4)
        pdf.set_font('Helvetica', '', 9)
        # Write body in chunks
        for line in body[:3000].split('\n'):
            line = clean(line.strip())
            if line:
                pdf.multi_cell(0, 5, line[:200])
        pdf.output(str(filename))
        return True
    except Exception as e:
        print(f"    PDF error: {e}")
        return False

# Results storage
all_results = []
seen_ids = set()

# Search each account
for account, token in tokens.items():
    print(f"\n{'='*50}")
    print(f"Searching: {account}")
    
    for query_name, query in SEARCH_QUERIES:
        messages, status = gmail_search(token, query, max_results=50)
        
        if status == 'expired':
            print(f"  Token expired for {account}")
            break
        
        if not messages:
            continue
        
        print(f"  Query '{query_name}': {len(messages)} messages")
        
        for msg_ref in messages[:50]:
            msg_id = msg_ref['id']
            if msg_id in seen_ids:
                continue
            seen_ids.add(msg_id)
            
            msg = get_message(token, msg_id)
            if not msg:
                continue
            
            headers = get_headers(msg)
            subject = headers.get('subject', '(no subject)')
            sender = headers.get('from', '')
            date = parse_date_from_email(headers, msg)
            body = extract_body(msg)
            
            # Determine platform
            platform = 'unknown'
            sender_lower = sender.lower()
            subject_lower = subject.lower()
            body_lower = body.lower()
            
            if 'vrbo' in sender_lower or 'homeaway' in sender_lower or 'vrbo' in subject_lower:
                platform = 'VRBO'
            elif 'booking.com' in sender_lower or 'booking.com' in subject_lower:
                platform = 'Booking.com'
            elif 'tripadvisor' in sender_lower or 'flipkey' in sender_lower:
                platform = 'TripAdvisor/FlipKey'
            elif 'houfy' in sender_lower:
                platform = 'Houfy'
            elif 'airbnb' in sender_lower or 'airbnb' in subject_lower:
                platform = 'Airbnb'  # Already handled, but catch any missed
            else:
                # Check body
                if 'vrbo' in body_lower or 'homeaway' in body_lower:
                    platform = 'VRBO'
                elif 'booking.com' in body_lower:
                    platform = 'Booking.com'
                else:
                    continue  # Skip non-platform emails
            
            # Skip Airbnb (already handled)
            if platform == 'Airbnb':
                continue
            
            # Determine email type
            email_type = 'other'
            combined = (subject_lower + ' ' + body_lower)
            if any(w in combined for w in ['payout', 'payment sent', 'deposit', 'funds transferred', 'bank transfer']):
                email_type = 'payout'
            elif any(w in combined for w in ['reservation', 'booking confirmed', 'new booking', 'new reservation']):
                email_type = 'reservation'
            elif any(w in combined for w in ['invoice', 'statement', 'earnings']):
                email_type = 'invoice'
            elif any(w in combined for w in ['cancellation', 'cancelled', 'canceled']):
                email_type = 'cancellation'
            
            # Parse amount
            amount = parse_amount(body + ' ' + subject)
            
            # Get year
            year = date[:4] if date else 'unknown'
            
            # Create PDF
            safe_date = date.replace('-', '_') if date else 'unknown'
            safe_platform = platform.replace('/', '_').replace('.', '_').replace(' ', '_')
            filename = OUTPUT_DIR / f"{safe_platform}_{email_type}_{safe_date}_{msg_id[:8]}.pdf"
            
            pdf_created = create_pdf(filename, subject, sender, date, body, account)
            
            result = {
                'platform': platform,
                'email_type': email_type,
                'date': date,
                'year': year,
                'subject': subject,
                'sender': sender,
                'account': account,
                'amount_usd': amount,
                'body_preview': body[:500],
                'pdf_file': str(filename) if pdf_created else None,
                'msg_id': msg_id,
            }
            all_results.append(result)
            
            print(f"    [{platform}] {email_type} | {date} | ${amount:.2f} | {subject[:50]}")
            
            time.sleep(0.1)

# Save results
output_file = '/home/ubuntu/upload/vrbo_booking_results.json'
with open(output_file, 'w') as f:
    json.dump(all_results, f, indent=2)

# Summary
print(f"\n{'='*60}")
print(f"TOTAL RESULTS: {len(all_results)}")
print(f"\nBy Platform:")
from collections import Counter
platforms = Counter(r['platform'] for r in all_results)
for p, c in platforms.most_common():
    print(f"  {p}: {c}")

print(f"\nBy Year:")
years = Counter(r['year'] for r in all_results)
for y, c in sorted(years.items()):
    print(f"  {y}: {c}")

print(f"\nPayout emails:")
payouts = [r for r in all_results if r['email_type'] == 'payout']
for r in sorted(payouts, key=lambda x: x['date']):
    print(f"  [{r['platform']}] {r['date']} | ${r['amount_usd']:.2f} | {r['subject'][:60]}")

print(f"\nResults saved to {output_file}")
print(f"PDFs saved to {OUTPUT_DIR}")
