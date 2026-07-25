"""
Scrape all connected Gmail accounts for 2026 Artiste's Boutique expense evidence.
Accounts: tarikp@gmail.com, tarikp.us@gmail.com, tarik@maxfieldmarket.com,
          tarik@tjperkinsfam.com, tarik@maxfieldbakery.com, tarik.perkins@startout.org
"""

import os
import json
import base64
import re
import subprocess
import requests
from datetime import datetime
from pathlib import Path
from fpdf import FPDF

OUTPUT_DIR = Path('/home/ubuntu/upload/expenses_2026')
OUTPUT_DIR.mkdir(exist_ok=True)

RESULTS_FILE = '/home/ubuntu/upload/gmail_2026_results.json'

# ─── Token helpers ────────────────────────────────────────────────────────────

def get_db_token(account_email):
    """Decrypt and refresh token for a given account using the project's Node helper."""
    script = f"""
import {{ createConnection }} from 'mysql2/promise';
import {{ createDecipheriv, createHash, scryptSync }} from 'crypto';

const db = await createConnection(process.env.DATABASE_URL);
const [rows] = await db.execute(
  'SELECT accessToken, refreshToken, expiresAt FROM oauth_tokens WHERE accountEmail = ? AND status = "active" AND purposes LIKE "%email_scraping%" ORDER BY updatedAt DESC LIMIT 1',
  ['{account_email}']
);
await db.end();

if (!rows.length) {{ console.log(JSON.stringify({{ error: 'no token' }})); process.exit(0); }}
const row = rows[0];

function decrypt(enc) {{
  if (!enc || !enc.startsWith('enc:')) return enc;
  const key = scryptSync(process.env.JWT_SECRET, 'salt', 32);
  const buf = Buffer.from(enc.slice(4), 'base64');
  const iv = buf.slice(0, 16);
  const tag = buf.slice(16, 32);
  const data = buf.slice(32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, null, 'utf8') + decipher.final('utf8');
}}

const accessToken = decrypt(row.accessToken);
const refreshToken = decrypt(row.refreshToken);
const expiresAt = row.expiresAt;

// Check if expired
const now = Date.now();
if (expiresAt && new Date(expiresAt).getTime() < now) {{
  // Refresh
  const resp = await fetch('https://oauth2.googleapis.com/token', {{
    method: 'POST',
    headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }},
    body: new URLSearchParams({{
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }}),
  }});
  const data = await resp.json();
  if (data.access_token) {{
    console.log(JSON.stringify({{ access_token: data.access_token }}));
  }} else {{
    console.log(JSON.stringify({{ error: JSON.stringify(data) }}));
  }}
}} else {{
  console.log(JSON.stringify({{ access_token: accessToken }}));
}}
"""
    result = subprocess.run(
        ['node', '--input-type=module'],
        input=script, capture_output=True, text=True,
        cwd='/home/ubuntu/geeves-shopping',
        env={**os.environ}
    )
    try:
        data = json.loads(result.stdout.strip().split('\n')[-1])
        return data.get('access_token')
    except Exception as e:
        print(f"  Token error for {account_email}: {e} | stdout: {result.stdout[:200]} | stderr: {result.stderr[:200]}")
        return None


def search_gmail(access_token, query, max_results=50):
    """Search Gmail and return list of message metadata."""
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    params = {'q': query, 'maxResults': max_results}
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, params=params, headers=headers, timeout=30)
    if resp.status_code != 200:
        return []
    return resp.json().get('messages', [])


def get_message(access_token, msg_id):
    """Get full message details."""
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, params={'format': 'full'}, headers=headers, timeout=30)
    if resp.status_code != 200:
        return None
    return resp.json()


def get_attachment(access_token, msg_id, attachment_id):
    """Download an attachment."""
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
    """Extract plain text from message body."""
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


def create_email_pdf(subject, sender, date_str, body_text, output_path):
    """Create a PDF from email content."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, 'Email Evidence', ln=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 6, f'Date: {date_str}', ln=True)
    pdf.cell(0, 6, f'From: {sender[:80]}', ln=True)
    pdf.multi_cell(0, 6, f'Subject: {subject[:120]}')
    pdf.ln(4)
    pdf.set_font('Helvetica', '', 9)
    for line in (body_text or '')[:3000].split('\n'):
        try:
            pdf.multi_cell(0, 5, line[:200])
        except Exception:
            pass
    pdf.output(str(output_path))


def parse_date(date_header):
    """Parse email date header to datetime."""
    for fmt in ['%a, %d %b %Y %H:%M:%S %z', '%d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M:%S %Z']:
        try:
            return datetime.strptime(date_header[:30].strip(), fmt)
        except Exception:
            pass
    return datetime.now()


# ─── Search categories ────────────────────────────────────────────────────────

SEARCHES_2026 = [
    # JPS bills
    ('jps_bills', 'from:no-reply@jpsco.com after:2025/12/31 before:2026/07/01'),
    ('jps_bills2', 'subject:"JPS Bill" after:2025/12/31 before:2026/07/01'),
    # NWC bills
    ('nwc_bills', 'from:ebill@nwc.com.jm after:2025/12/31 before:2026/07/01'),
    # Cleaning
    ('cleaning', 'subject:cleaning OR subject:"clean" after:2025/12/31 before:2026/07/01'),
    # Maintenance
    ('maintenance', 'subject:maintenance OR subject:repair OR subject:plumb OR subject:electric after:2025/12/31 before:2026/07/01'),
    # Digicel
    ('digicel', 'from:digicel OR subject:digicel after:2025/12/31 before:2026/07/01'),
    # Flow
    ('flow', 'from:flow OR subject:"flow bill" after:2025/12/31 before:2026/07/01'),
    # Insurance
    ('insurance', 'subject:insurance after:2025/12/31 before:2026/07/01'),
    # Bill Express payments
    ('bill_express', 'from:support@myamberpay.com OR subject:"bill payment" after:2025/12/31 before:2026/07/01'),
    # Airbnb
    ('airbnb', 'from:airbnb OR subject:airbnb after:2025/12/31 before:2026/07/01'),
    # VRBO
    ('vrbo', 'from:vrbo OR subject:vrbo after:2025/12/31 before:2026/07/01'),
    # Booking.com
    ('booking', 'from:booking.com OR subject:"booking.com" after:2025/12/31 before:2026/07/01'),
    # Property management
    ('property_mgmt', 'subject:"dillsbury" OR subject:"artiste" after:2025/12/31 before:2026/07/01'),
]

# Accounts to search (those with email_scraping purpose)
ACCOUNTS = [
    'tarikp@gmail.com',
    'tarikp.us@gmail.com',
    'tarik@maxfieldmarket.com',
    'tarik@tjperkinsfam.com',
    'tarik@maxfieldbakery.com',
]

# ─── Main scraping loop ───────────────────────────────────────────────────────

all_results = []
seen_msg_ids = set()

for account in ACCOUNTS:
    print(f'\n=== Searching {account} ===')
    token = get_db_token(account)
    if not token:
        print(f'  No token available for {account}')
        continue
    print(f'  Got access token')

    for category, query in SEARCHES_2026:
        messages = search_gmail(token, query, max_results=50)
        if not messages:
            continue
        print(f'  [{category}] Found {len(messages)} messages')

        for msg_meta in messages:
            msg_id = msg_meta['id']
            if msg_id in seen_msg_ids:
                continue
            seen_msg_ids.add(msg_id)

            msg = get_message(token, msg_id)
            if not msg:
                continue

            headers = extract_headers(msg)
            subject = headers.get('subject', '')
            sender = headers.get('from', '')
            date_header = headers.get('date', '')
            date_obj = parse_date(date_header)
            date_str = date_obj.strftime('%Y-%m-%d')
            month = date_obj.month
            year = date_obj.year

            # Only process 2026 messages
            if year != 2026:
                continue

            # Check for PDF attachments
            saved_files = []
            payload = msg.get('payload', {})

            def find_attachments(part):
                results = []
                if part.get('filename') and part.get('filename').lower().endswith('.pdf'):
                    att_id = part.get('body', {}).get('attachmentId')
                    if att_id:
                        results.append((part['filename'], att_id))
                for p in part.get('parts', []):
                    results.extend(find_attachments(p))
                return results

            attachments = find_attachments(payload)

            if attachments:
                for filename, att_id in attachments:
                    safe_name = re.sub(r'[^\w\-.]', '_', filename)
                    out_path = OUTPUT_DIR / f'{date_str}_{category}_{safe_name}'
                    att_data = get_attachment(token, msg_id, att_id)
                    if att_data:
                        out_path.write_bytes(att_data)
                        saved_files.append(str(out_path))
                        print(f'    Saved PDF: {out_path.name}')
            else:
                # Create email PDF
                body_text = extract_body_text(msg)
                safe_subject = re.sub(r'[^\w\-]', '_', subject[:50])
                out_path = OUTPUT_DIR / f'{date_str}_{category}_{safe_subject}_email.pdf'
                create_email_pdf(subject, sender, date_str, body_text, out_path)
                saved_files.append(str(out_path))

            all_results.append({
                'account': account,
                'category': category,
                'msg_id': msg_id,
                'subject': subject,
                'sender': sender,
                'date': date_str,
                'month': month,
                'year': year,
                'files': saved_files,
            })

# Save results
with open(RESULTS_FILE, 'w') as f:
    json.dump(all_results, f, indent=2)

print(f'\n=== SUMMARY ===')
print(f'Total 2026 expense emails processed: {len(all_results)}')
from collections import Counter
cats = Counter(r['category'] for r in all_results)
for cat, count in sorted(cats.items()):
    print(f'  {cat}: {count}')
print(f'Total files saved: {sum(len(r["files"]) for r in all_results)}')
