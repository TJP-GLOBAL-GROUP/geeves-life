"""
Scrape all connected Gmail accounts for 2026 Artiste's Boutique:
- Expenses (JPS, NWC, maintenance, cleaning, etc.)
- Income (Airbnb, VRBO, Booking.com)

Also scrape 2024 and 2025 income from all accounts.
"""

import os
import json
import base64
import re
import requests
from datetime import datetime
from pathlib import Path
from fpdf import FPDF
from collections import defaultdict

# Load tokens
with open('/home/ubuntu/upload/all_gmail_tokens.json') as f:
    TOKENS = json.load(f)

# Output directories
EXPENSE_DIR_2026 = Path('/home/ubuntu/upload/expenses_2026')
INCOME_DIR = Path('/home/ubuntu/upload/income_docs')
EXPENSE_DIR_2026.mkdir(exist_ok=True)
INCOME_DIR.mkdir(exist_ok=True)

# ─── Gmail helpers ────────────────────────────────────────────────────────────

def search_gmail(access_token, query, max_results=100):
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    params = {'q': query, 'maxResults': max_results}
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, params=params, headers=headers, timeout=30)
    if resp.status_code != 200:
        return []
    return resp.json().get('messages', [])

def get_message(access_token, msg_id):
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, params={'format': 'full'}, headers=headers, timeout=30)
    if resp.status_code != 200:
        return None
    return resp.json()

def get_attachment(access_token, msg_id, attachment_id):
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}/attachments/{attachment_id}'
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        return None
    data = resp.json().get('data', '')
    return base64.urlsafe_b64decode(data + '==')

def extract_headers(msg):
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']
    return headers

def extract_body_text(msg):
    def get_parts(payload):
        parts = []
        if payload.get('mimeType') == 'text/plain':
            data = payload.get('body', {}).get('data', '')
            if data:
                parts.append(base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace'))
        for part in payload.get('parts', []):
            parts.extend(get_parts(part))
        return parts
    return '\n'.join(get_parts(msg.get('payload', {})))

def find_attachments(part):
    results = []
    fname = part.get('filename', '')
    if fname and (fname.lower().endswith('.pdf') or fname.lower().endswith('.csv')):
        att_id = part.get('body', {}).get('attachmentId')
        if att_id:
            results.append((fname, att_id, part.get('mimeType', 'application/octet-stream')))
    for p in part.get('parts', []):
        results.extend(find_attachments(p))
    return results

def sanitize(text):
    """Remove characters that can't be encoded in latin-1."""
    return ''.join(c if ord(c) < 256 else '?' for c in (text or ''))

def create_email_pdf(subject, sender, date_str, body_text, output_path):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, 'Email Evidence', ln=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 6, f'Date: {date_str}', ln=True)
    pdf.cell(0, 6, sanitize(f'From: {sender[:80]}'), ln=True)
    pdf.multi_cell(0, 6, sanitize(f'Subject: {subject[:120]}'))
    pdf.ln(4)
    pdf.set_font('Helvetica', '', 9)
    for line in sanitize(body_text or '')[:4000].split('\n'):
        try:
            pdf.multi_cell(0, 5, line[:200])
        except Exception:
            pass
    pdf.output(str(output_path))

def parse_date(date_header):
    for fmt in ['%a, %d %b %Y %H:%M:%S %z', '%d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M:%S %Z']:
        try:
            return datetime.strptime(date_header[:35].strip(), fmt)
        except Exception:
            pass
    return None

# ─── Search definitions ───────────────────────────────────────────────────────

# 2026 expense searches (Jan-Jun 2026)
EXPENSE_SEARCHES_2026 = [
    ('jps_bills',    'from:no-reply@jpsco.com after:2025/12/31 before:2026/07/01'),
    ('jps_bills2',   'subject:"JPS Bill" A/C after:2025/12/31 before:2026/07/01'),
    ('nwc_bills',    'from:ebill@nwc.com.jm after:2025/12/31 before:2026/07/01'),
    ('cleaning',     '(subject:cleaning OR subject:"clean fee") after:2025/12/31 before:2026/07/01'),
    ('maintenance',  '(subject:maintenance OR subject:repair OR subject:plumb) after:2025/12/31 before:2026/07/01'),
    ('digicel',      '(from:digicel OR subject:digicel) after:2025/12/31 before:2026/07/01'),
    ('bill_express', 'from:support@myamberpay.com after:2025/12/31 before:2026/07/01'),
    ('insurance',    '(subject:insurance renewal OR subject:"property insurance") after:2025/12/31 before:2026/07/01'),
]

# Income searches for ALL years (2024-2026)
INCOME_SEARCHES = [
    # Airbnb
    ('airbnb_2024', 'from:airbnb after:2023/12/31 before:2025/01/01', 2024),
    ('airbnb_2025', 'from:airbnb after:2024/12/31 before:2026/01/01', 2025),
    ('airbnb_2026', 'from:airbnb after:2025/12/31 before:2026/07/01', 2026),
    # VRBO
    ('vrbo_2024', '(from:vrbo.com OR from:homeaway.com OR subject:vrbo) after:2023/12/31 before:2025/01/01', 2024),
    ('vrbo_2025', '(from:vrbo.com OR from:homeaway.com OR subject:vrbo) after:2024/12/31 before:2026/01/01', 2025),
    ('vrbo_2026', '(from:vrbo.com OR from:homeaway.com OR subject:vrbo) after:2025/12/31 before:2026/07/01', 2026),
    # Booking.com
    ('booking_2024', '(from:booking.com OR subject:"booking.com") after:2023/12/31 before:2025/01/01', 2024),
    ('booking_2025', '(from:booking.com OR subject:"booking.com") after:2024/12/31 before:2026/01/01', 2025),
    ('booking_2026', '(from:booking.com OR subject:"booking.com") after:2025/12/31 before:2026/07/01', 2026),
    # Expedia
    ('expedia_2024', '(from:expedia OR subject:expedia) after:2023/12/31 before:2025/01/01', 2024),
    ('expedia_2025', '(from:expedia OR subject:expedia) after:2024/12/31 before:2026/01/01', 2025),
    ('expedia_2026', '(from:expedia OR subject:expedia) after:2025/12/31 before:2026/07/01', 2026),
    # Generic rental income
    ('rental_2024', '(subject:"reservation confirmed" OR subject:"booking confirmed" OR subject:"payout") after:2023/12/31 before:2025/01/01', 2024),
    ('rental_2025', '(subject:"reservation confirmed" OR subject:"booking confirmed" OR subject:"payout") after:2024/12/31 before:2026/01/01', 2025),
    ('rental_2026', '(subject:"reservation confirmed" OR subject:"booking confirmed" OR subject:"payout") after:2025/12/31 before:2026/07/01', 2026),
]

# ─── Scraping ─────────────────────────────────────────────────────────────────

expense_results_2026 = []
income_results = []
seen_msg_ids = set()

print('=== SCRAPING 2026 EXPENSES ===')
for account, token in TOKENS.items():
    print(f'\n--- {account} ---')
    for category, query in EXPENSE_SEARCHES_2026:
        messages = search_gmail(token, query, max_results=50)
        if not messages:
            continue
        print(f'  [{category}] {len(messages)} messages')
        for msg_meta in messages:
            msg_id = f'exp_{msg_meta["id"]}'
            if msg_id in seen_msg_ids:
                continue
            seen_msg_ids.add(msg_id)
            msg = get_message(token, msg_meta['id'])
            if not msg:
                continue
            hdrs = extract_headers(msg)
            subject = hdrs.get('subject', '')
            sender = hdrs.get('from', '')
            date_obj = parse_date(hdrs.get('date', ''))
            if not date_obj or date_obj.year != 2026:
                continue
            date_str = date_obj.strftime('%Y-%m-%d')
            saved_files = []
            atts = find_attachments(msg.get('payload', {}))
            if atts:
                for fname, att_id, mime in atts:
                    if not fname.lower().endswith('.pdf'):
                        continue
                    safe = re.sub(r'[^\w\-.]', '_', fname)
                    out = EXPENSE_DIR_2026 / f'{date_str}_{category}_{safe}'
                    data = get_attachment(token, msg_meta['id'], att_id)
                    if data:
                        out.write_bytes(data)
                        saved_files.append(str(out))
            else:
                body = extract_body_text(msg)
                safe_subj = re.sub(r'[^\w\-]', '_', subject[:50])
                out = EXPENSE_DIR_2026 / f'{date_str}_{category}_{safe_subj}_email.pdf'
                create_email_pdf(subject, sender, date_str, body, out)
                saved_files.append(str(out))
            expense_results_2026.append({
                'account': account, 'category': category,
                'subject': subject, 'sender': sender,
                'date': date_str, 'month': date_obj.month, 'year': 2026,
                'files': saved_files,
            })

print(f'\nTotal 2026 expense emails: {len(expense_results_2026)}')

print('\n=== SCRAPING INCOME (ALL YEARS) ===')
seen_income_ids = set()
for account, token in TOKENS.items():
    print(f'\n--- {account} ---')
    for category, query, year in INCOME_SEARCHES:
        messages = search_gmail(token, query, max_results=100)
        if not messages:
            continue
        print(f'  [{category}] {len(messages)} messages')
        for msg_meta in messages:
            msg_id = f'inc_{msg_meta["id"]}'
            if msg_id in seen_income_ids:
                continue
            seen_income_ids.add(msg_id)
            msg = get_message(token, msg_meta['id'])
            if not msg:
                continue
            hdrs = extract_headers(msg)
            subject = hdrs.get('subject', '')
            sender = hdrs.get('from', '')
            date_obj = parse_date(hdrs.get('date', ''))
            if not date_obj or date_obj.year != year:
                continue
            date_str = date_obj.strftime('%Y-%m-%d')
            body = extract_body_text(msg)
            saved_files = []
            atts = find_attachments(msg.get('payload', {}))
            if atts:
                for fname, att_id, mime in atts:
                    safe = re.sub(r'[^\w\-.]', '_', fname)
                    out = INCOME_DIR / f'{date_str}_{category}_{safe}'
                    data = get_attachment(token, msg_meta['id'], att_id)
                    if data:
                        out.write_bytes(data)
                        saved_files.append(str(out))
            # Always create email PDF for income evidence
            safe_subj = re.sub(r'[^\w\-]', '_', subject[:50])
            out = INCOME_DIR / f'{date_str}_{category}_{safe_subj}_email.pdf'
            if not out.exists():
                create_email_pdf(subject, sender, date_str, body, out)
                saved_files.append(str(out))

            # Try to extract amount from subject or body
            amount_jmd = 0
            amount_usd = 0
            # Look for USD amounts (Airbnb/VRBO pay in USD)
            usd_match = re.search(r'USD?\s*\$?([\d,]+\.?\d*)', subject + ' ' + body[:500], re.IGNORECASE)
            if usd_match:
                try:
                    amount_usd = float(usd_match.group(1).replace(',', ''))
                except Exception:
                    pass
            # Look for JMD amounts
            jmd_match = re.search(r'J\$\s*([\d,]+\.?\d*)', subject + ' ' + body[:500])
            if jmd_match:
                try:
                    amount_jmd = float(jmd_match.group(1).replace(',', ''))
                except Exception:
                    pass
            # Generic dollar amount
            if not amount_usd and not amount_jmd:
                dollar_match = re.search(r'\$\s*([\d,]+\.?\d*)', subject)
                if dollar_match:
                    try:
                        val = float(dollar_match.group(1).replace(',', ''))
                        if val > 0:
                            amount_usd = val
                    except Exception:
                        pass

            # Determine platform
            platform = 'other'
            sender_lower = sender.lower()
            subject_lower = subject.lower()
            if 'airbnb' in sender_lower or 'airbnb' in subject_lower:
                platform = 'airbnb'
            elif 'vrbo' in sender_lower or 'vrbo' in subject_lower or 'homeaway' in sender_lower:
                platform = 'vrbo'
            elif 'booking.com' in sender_lower or 'booking.com' in subject_lower:
                platform = 'booking'
            elif 'expedia' in sender_lower or 'expedia' in subject_lower:
                platform = 'expedia'

            # Determine email type
            email_type = 'other'
            if any(w in subject_lower for w in ['payout', 'payment sent', 'you earned']):
                email_type = 'payout'
            elif any(w in subject_lower for w in ['reservation confirmed', 'booking confirmed', 'new reservation']):
                email_type = 'reservation'
            elif any(w in subject_lower for w in ['cancelled', 'cancellation']):
                email_type = 'cancellation'
            elif any(w in subject_lower for w in ['review', 'feedback']):
                email_type = 'review'
            elif any(w in subject_lower for w in ['message', 'inquiry', 'question']):
                email_type = 'message'

            income_results.append({
                'account': account,
                'platform': platform,
                'email_type': email_type,
                'category': category,
                'subject': subject,
                'sender': sender,
                'date': date_str,
                'month': date_obj.month,
                'year': year,
                'amount_usd': amount_usd,
                'amount_jmd': amount_jmd,
                'body_preview': body[:500],
                'files': saved_files,
            })

print(f'\nTotal income emails: {len(income_results)}')

# Save results
with open('/home/ubuntu/upload/gmail_2026_expense_results.json', 'w') as f:
    json.dump(expense_results_2026, f, indent=2)

with open('/home/ubuntu/upload/gmail_income_results.json', 'w') as f:
    json.dump(income_results, f, indent=2)

# ─── Summary ──────────────────────────────────────────────────────────────────
print('\n=== EXPENSE SUMMARY 2026 ===')
from collections import Counter
cats = Counter(r['category'] for r in expense_results_2026)
for cat, count in sorted(cats.items()):
    print(f'  {cat}: {count}')

print('\n=== INCOME SUMMARY BY YEAR/PLATFORM ===')
for year in [2024, 2025, 2026]:
    year_income = [r for r in income_results if r['year'] == year]
    by_platform = Counter(r['platform'] for r in year_income)
    by_type = Counter(r['email_type'] for r in year_income)
    print(f'\n  {year}: {len(year_income)} total emails')
    for plat, count in sorted(by_platform.items()):
        payouts = [r for r in year_income if r['platform'] == plat and r['email_type'] == 'payout']
        reservations = [r for r in year_income if r['platform'] == plat and r['email_type'] == 'reservation']
        total_usd = sum(r['amount_usd'] for r in payouts)
        print(f'    {plat}: {count} emails ({len(payouts)} payouts, {len(reservations)} reservations, USD ${total_usd:,.2f} from subjects)')

print('\n=== INCOME PAYOUT DETAILS ===')
payouts = [r for r in income_results if r['email_type'] == 'payout']
payouts.sort(key=lambda x: x['date'])
for p in payouts:
    print(f'  {p["date"]} | {p["platform"]} | USD ${p["amount_usd"]:,.2f} | {p["subject"][:60]}')
