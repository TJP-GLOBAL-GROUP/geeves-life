"""
Comprehensive vendor evidence scraper for Artiste's Boutique.
Searches ALL connected Gmail accounts for:
- Bills / invoices (what was owed)
- Payment confirmations / receipts (proof of payment)

Vendors:
1. JPS (Jamaica Public Service) - electricity bills + Bill Express payment confirmations
2. NWC (National Water Commission) - water bills + payment confirmations
3. Home and Garden Care - invoices + payment receipts
4. Water Crystal Pools - invoices + payment receipts
5. Courtney Robinson - already have WhatsApp receipts, but check for any emails
6. Digicel / Flow - utility bills
7. Guardian / Sagicor - insurance bills
8. Hardware stores (Hardware & Lumber, Rapid True Value, etc.)
9. PriceSmart - receipts
10. Property tax / TAJ (Tax Administration Jamaica)
11. Any other vendors found

For each document found, records:
- vendor name
- document type: 'bill' or 'payment_receipt'
- date
- amount
- year
- email account found in
- Gmail message ID (for downloading attachment)
- S3 upload path
"""

import json
import os
import re
import requests
import base64
from pathlib import Path
from datetime import datetime
from fpdf import FPDF

TOKENS_FILE = '/home/ubuntu/upload/all_gmail_tokens.json'
OUTPUT_DIR = Path('/home/ubuntu/upload/vendor_evidence')
OUTPUT_DIR.mkdir(exist_ok=True)

with open(TOKENS_FILE) as f:
    TOKENS = json.load(f)

YEARS = ['2023', '2024', '2025', '2026']

# Vendor search configurations
# Each entry: (vendor_name, qbo_category, search_queries, bill_keywords, payment_keywords)
VENDORS = [
    {
        'name': 'JPS',
        'qbo_vendor': 'Jamaica Public Service Co.',
        'category': 'UTILITIES',
        'bill_searches': [
            'from:jps subject:bill',
            'from:jps subject:invoice',
            'from:noreply@jpsco.com',
            'JPS electricity bill',
            'JPS account statement',
        ],
        'payment_searches': [
            'JPS payment confirmation',
            'JPS bill paid',
            'Bill Express JPS',
            'billexpress JPS',
            'JPS receipt',
        ],
        'amount_patterns': [
            r'Amount Due[:\s]+\$?([\d,]+\.?\d*)',
            r'Total Amount[:\s]+\$?([\d,]+\.?\d*)',
            r'Balance Due[:\s]+\$?([\d,]+\.?\d*)',
            r'Payment Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'NWC',
        'qbo_vendor': 'National Water Commission',
        'category': 'UTILITIES',
        'bill_searches': [
            'from:nwcjamaica.com',
            'NWC water bill',
            'National Water Commission bill',
            'NWC account statement',
            'NWC invoice',
        ],
        'payment_searches': [
            'NWC payment confirmation',
            'NWC bill paid',
            'Bill Express NWC',
            'NWC receipt',
        ],
        'amount_patterns': [
            r'Amount Due[:\s]+\$?([\d,]+\.?\d*)',
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Balance[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Home and Garden Care',
        'qbo_vendor': 'Home and Garden Care',
        'category': 'MAINTENANCE SUPPLIES',
        'bill_searches': [
            'Home and Garden Care',
            'home garden care invoice',
            'home garden care bill',
            '"home and garden"',
        ],
        'payment_searches': [
            'Home and Garden Care payment',
            'Home and Garden Care receipt',
            'TRF TO: HOME AND GARDEN',
        ],
        'amount_patterns': [
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
            r'\$\s*([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Water Crystal Pools',
        'qbo_vendor': 'Water Crystal Pools',
        'category': 'MAINTENANCE SUPPLIES',
        'bill_searches': [
            'Water Crystal Pools',
            'water crystal pool',
            'pool service invoice',
            'pool maintenance bill',
            'crystal pools',
        ],
        'payment_searches': [
            'Water Crystal Pools payment',
            'Water Crystal Pools receipt',
            'pool service payment',
        ],
        'amount_patterns': [
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Digicel',
        'qbo_vendor': 'Digicel Jamaica',
        'category': 'UTILITIES',
        'bill_searches': [
            'from:digicel subject:bill',
            'Digicel bill',
            'Digicel invoice',
            'Digicel statement',
        ],
        'payment_searches': [
            'Digicel payment',
            'Digicel receipt',
        ],
        'amount_patterns': [
            r'Amount Due[:\s]+\$?([\d,]+\.?\d*)',
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Flow',
        'qbo_vendor': 'Flow Jamaica',
        'category': 'UTILITIES',
        'bill_searches': [
            'from:flow subject:bill',
            'Flow Jamaica bill',
            'Flow invoice',
            'c&w flow bill',
        ],
        'payment_searches': [
            'Flow payment confirmation',
            'Flow receipt',
        ],
        'amount_patterns': [
            r'Amount Due[:\s]+\$?([\d,]+\.?\d*)',
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Guardian Life',
        'qbo_vendor': 'Guardian Life Limited',
        'category': 'ADMINISTRATIVE EXPENSE',
        'bill_searches': [
            'Guardian Life insurance',
            'Guardian Life premium',
            'Guardian Life invoice',
            'from:guardian',
        ],
        'payment_searches': [
            'Guardian Life payment',
            'Guardian Life receipt',
            'insurance premium paid',
        ],
        'amount_patterns': [
            r'Premium[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Sagicor',
        'qbo_vendor': 'Sagicor Life Jamaica',
        'category': 'ADMINISTRATIVE EXPENSE',
        'bill_searches': [
            'Sagicor insurance',
            'Sagicor premium',
            'Sagicor invoice',
            'from:sagicor',
        ],
        'payment_searches': [
            'Sagicor payment',
            'Sagicor receipt',
        ],
        'amount_patterns': [
            r'Premium[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Hardware and Lumber',
        'qbo_vendor': 'Hardware & Lumber Ltd',
        'category': 'MAINTENANCE SUPPLIES',
        'bill_searches': [
            'Hardware and Lumber',
            'hardware lumber invoice',
            'hardware lumber receipt',
        ],
        'payment_searches': [
            'Hardware and Lumber payment',
            'Hardware and Lumber receipt',
        ],
        'amount_patterns': [
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'PriceSmart',
        'qbo_vendor': 'PriceSmart Jamaica',
        'category': 'MAINTENANCE SUPPLIES',
        'bill_searches': [
            'PriceSmart receipt',
            'PriceSmart invoice',
            'from:pricesmart',
        ],
        'payment_searches': [
            'PriceSmart payment',
            'PriceSmart order confirmation',
        ],
        'amount_patterns': [
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'TAJ Property Tax',
        'qbo_vendor': 'Tax Administration Jamaica',
        'category': 'PROPERTY TAX',
        'bill_searches': [
            'property tax Jamaica',
            'TAJ property tax',
            'Tax Administration Jamaica',
            'property tax dillsbury',
            'property tax 7 dillsbury',
        ],
        'payment_searches': [
            'property tax payment',
            'TAJ receipt',
            'property tax paid',
        ],
        'amount_patterns': [
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
    {
        'name': 'Courtney Robinson',
        'qbo_vendor': 'Courtney Robinson',
        'category': 'CLEANING FEE',
        'bill_searches': [
            'Courtney Robinson invoice',
            'Courtney Robinson bill',
            'cleaning invoice dillsbury',
        ],
        'payment_searches': [
            'Courtney Robinson payment',
            'Courtney Robinson receipt',
        ],
        'amount_patterns': [
            r'Total[:\s]+\$?([\d,]+\.?\d*)',
            r'Amount[:\s]+\$?([\d,]+\.?\d*)',
        ],
    },
]


def gmail_search(token, query, max_results=50):
    """Search Gmail and return list of message metadata."""
    url = 'https://www.googleapis.com/gmail/v1/users/me/messages'
    headers = {'Authorization': f'Bearer {token}'}
    params = {'q': query, 'maxResults': max_results}
    
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if r.status_code == 401:
            return None, 'expired'
        if r.status_code != 200:
            return [], None
        data = r.json()
        return data.get('messages', []), None
    except Exception as e:
        return [], str(e)


def get_message(token, msg_id):
    """Get full message details."""
    url = f'https://www.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    headers = {'Authorization': f'Bearer {token}'}
    params = {'format': 'full'}
    
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if r.status_code != 200:
            return None
        return r.json()
    except:
        return None


def get_attachment(token, msg_id, attachment_id):
    """Download a Gmail attachment."""
    url = f'https://www.googleapis.com/gmail/v1/users/me/messages/{msg_id}/attachments/{attachment_id}'
    headers = {'Authorization': f'Bearer {token}'}
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code != 200:
            return None
        data = r.json()
        return base64.urlsafe_b64decode(data.get('data', ''))
    except:
        return None


def extract_body_text(msg):
    """Extract plain text from a Gmail message."""
    def decode_part(part):
        data = part.get('body', {}).get('data', '')
        if data:
            try:
                return base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
            except:
                return ''
        return ''
    
    payload = msg.get('payload', {})
    mime_type = payload.get('mimeType', '')
    
    if mime_type == 'text/plain':
        return decode_part(payload)
    
    parts = payload.get('parts', [])
    for part in parts:
        if part.get('mimeType') == 'text/plain':
            text = decode_part(part)
            if text:
                return text
        # Recurse into multipart
        sub_parts = part.get('parts', [])
        for sp in sub_parts:
            if sp.get('mimeType') == 'text/plain':
                text = decode_part(sp)
                if text:
                    return text
    
    # Fallback: try HTML parts
    for part in parts:
        if part.get('mimeType') == 'text/html':
            html = decode_part(part)
            if html:
                # Strip HTML tags
                clean = re.sub(r'<[^>]+>', ' ', html)
                clean = re.sub(r'\s+', ' ', clean)
                return clean[:2000]
    
    return ''


def extract_amount(text, patterns):
    """Try to extract an amount from text using patterns."""
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(',', ''))
            except:
                pass
    return 0.0


def get_message_date(msg):
    """Extract date from message headers."""
    headers = msg.get('payload', {}).get('headers', [])
    for h in headers:
        if h.get('name', '').lower() == 'date':
            try:
                from email.utils import parsedate_to_datetime
                dt = parsedate_to_datetime(h['value'])
                return dt.strftime('%Y-%m-%d'), dt.year
            except:
                pass
    # Fallback: use internalDate
    internal = msg.get('internalDate', '0')
    try:
        dt = datetime.fromtimestamp(int(internal) / 1000)
        return dt.strftime('%Y-%m-%d'), dt.year
    except:
        return '2025-01-01', 2025


def get_subject(msg):
    headers = msg.get('payload', {}).get('headers', [])
    for h in headers:
        if h.get('name', '').lower() == 'subject':
            return h['value']
    return ''


def get_attachments_info(msg):
    """Get list of (filename, attachment_id, mime_type) for all attachments."""
    attachments = []
    
    def scan_parts(parts):
        for part in parts:
            filename = part.get('filename', '')
            att_id = part.get('body', {}).get('attachmentId', '')
            mime = part.get('mimeType', '')
            if filename and att_id:
                attachments.append((filename, att_id, mime))
            sub = part.get('parts', [])
            if sub:
                scan_parts(sub)
    
    scan_parts(msg.get('payload', {}).get('parts', []))
    return attachments


def make_email_pdf(subject, date, body_text, vendor, doc_type, account):
    """Create a PDF from email content."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 14)
    pdf.cell(0, 10, f'{vendor} - {doc_type.upper()}', ln=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 8, f'Date: {date}', ln=True)
    pdf.cell(0, 8, f'Account: {account}', ln=True)
    pdf.cell(0, 8, f'Subject: {subject[:80]}', ln=True)
    pdf.ln(5)
    pdf.set_font('Helvetica', '', 9)
    # Body text
    safe_text = body_text[:3000].encode('latin-1', errors='replace').decode('latin-1')
    for line in safe_text.split('\n')[:80]:
        try:
            pdf.cell(0, 5, line[:100], ln=True)
        except:
            pass
    return pdf.output(dest='S').encode('latin-1')


# ── Main scraping loop ─────────────────────────────────────────────────────

all_evidence = []
seen_msg_ids = set()

for email_account, token in TOKENS.items():
    print(f'\n=== Searching {email_account} ===')
    
    for vendor in VENDORS:
        vendor_name = vendor['name']
        vendor_dir = OUTPUT_DIR / vendor_name.replace(' ', '_').replace('/', '_')
        vendor_dir.mkdir(exist_ok=True)
        
        # Search for bills
        for search_q in vendor['bill_searches']:
            for year in YEARS:
                query = f'{search_q} after:{year}/01/01 before:{int(year)+1}/01/01'
                msgs, err = gmail_search(token, query, max_results=20)
                
                if err == 'expired':
                    print(f'  Token expired for {email_account}')
                    break
                if not msgs:
                    continue
                
                for msg_meta in msgs:
                    msg_id = msg_meta['id']
                    if msg_id in seen_msg_ids:
                        continue
                    seen_msg_ids.add(msg_id)
                    
                    msg = get_message(token, msg_id)
                    if not msg:
                        continue
                    
                    date_str, msg_year = get_message_date(msg)
                    subject = get_subject(msg)
                    body = extract_body_text(msg)
                    amount = extract_amount(body, vendor['amount_patterns'])
                    
                    # Check for PDF attachments
                    attachments = get_attachments_info(msg)
                    pdf_attachments = [(fn, aid, mt) for fn, aid, mt in attachments 
                                      if fn.lower().endswith('.pdf') or 'pdf' in mt.lower()]
                    
                    saved_files = []
                    
                    if pdf_attachments:
                        for fn, aid, mt in pdf_attachments[:2]:  # max 2 attachments
                            pdf_data = get_attachment(token, msg_id, aid)
                            if pdf_data:
                                safe_fn = re.sub(r'[^\w\-.]', '_', fn)
                                out_path = vendor_dir / f'bill_{date_str}_{msg_id[:8]}_{safe_fn}'
                                out_path.write_bytes(pdf_data)
                                saved_files.append(str(out_path))
                    else:
                        # Create PDF from email body
                        try:
                            pdf_bytes = make_email_pdf(subject, date_str, body, vendor_name, 'BILL', email_account)
                            out_path = vendor_dir / f'bill_{date_str}_{msg_id[:8]}.pdf'
                            out_path.write_bytes(pdf_bytes)
                            saved_files.append(str(out_path))
                        except Exception as e:
                            pass
                    
                    for fp in saved_files:
                        all_evidence.append({
                            'vendor': vendor_name,
                            'qbo_vendor': vendor['qbo_vendor'],
                            'category': vendor['category'],
                            'doc_type': 'bill',
                            'date': date_str,
                            'year': msg_year,
                            'amount': amount,
                            'currency': 'JMD',
                            'subject': subject[:100],
                            'email_account': email_account,
                            'msg_id': msg_id,
                            'local_file': fp,
                            's3_url': '',
                        })
                    
                    if saved_files:
                        print(f'  BILL [{vendor_name}] {date_str} ${amount:,.0f} - {subject[:50]}')
        
        # Search for payment receipts
        for search_q in vendor['payment_searches']:
            for year in YEARS:
                query = f'{search_q} after:{year}/01/01 before:{int(year)+1}/01/01'
                msgs, err = gmail_search(token, query, max_results=20)
                
                if err == 'expired':
                    break
                if not msgs:
                    continue
                
                for msg_meta in msgs:
                    msg_id = msg_meta['id']
                    if msg_id in seen_msg_ids:
                        continue
                    seen_msg_ids.add(msg_id)
                    
                    msg = get_message(token, msg_id)
                    if not msg:
                        continue
                    
                    date_str, msg_year = get_message_date(msg)
                    subject = get_subject(msg)
                    body = extract_body_text(msg)
                    amount = extract_amount(body, vendor['amount_patterns'])
                    
                    attachments = get_attachments_info(msg)
                    pdf_attachments = [(fn, aid, mt) for fn, aid, mt in attachments 
                                      if fn.lower().endswith('.pdf') or 'pdf' in mt.lower()]
                    
                    saved_files = []
                    
                    if pdf_attachments:
                        for fn, aid, mt in pdf_attachments[:2]:
                            pdf_data = get_attachment(token, msg_id, aid)
                            if pdf_data:
                                safe_fn = re.sub(r'[^\w\-.]', '_', fn)
                                out_path = vendor_dir / f'receipt_{date_str}_{msg_id[:8]}_{safe_fn}'
                                out_path.write_bytes(pdf_data)
                                saved_files.append(str(out_path))
                    else:
                        try:
                            pdf_bytes = make_email_pdf(subject, date_str, body, vendor_name, 'PAYMENT RECEIPT', email_account)
                            out_path = vendor_dir / f'receipt_{date_str}_{msg_id[:8]}.pdf'
                            out_path.write_bytes(pdf_bytes)
                            saved_files.append(str(out_path))
                        except Exception as e:
                            pass
                    
                    for fp in saved_files:
                        all_evidence.append({
                            'vendor': vendor_name,
                            'qbo_vendor': vendor['qbo_vendor'],
                            'category': vendor['category'],
                            'doc_type': 'payment_receipt',
                            'date': date_str,
                            'year': msg_year,
                            'amount': amount,
                            'currency': 'JMD',
                            'subject': subject[:100],
                            'email_account': email_account,
                            'msg_id': msg_id,
                            'local_file': fp,
                            's3_url': '',
                        })
                    
                    if saved_files:
                        print(f'  RECEIPT [{vendor_name}] {date_str} ${amount:,.0f} - {subject[:50]}')

# Also add Courtney Robinson WhatsApp transfers as payment receipts
courtney_dir = OUTPUT_DIR / 'Courtney_Robinson'
courtney_dir.mkdir(exist_ok=True)

with open('/home/ubuntu/read_courtney_transfers_2025.json') as f:
    courtney_2025 = json.load(f)

for r in courtney_2025['results']:
    o = r['output']
    if not o.get('date') or not o.get('amount_jmd'):
        continue
    
    src_file = Path(r['input'])
    if src_file.exists():
        # Copy to vendor dir
        dest = courtney_dir / f'receipt_{o["date"]}_{o["reference"]}.jpg'
        import shutil
        shutil.copy2(src_file, dest)
        
        all_evidence.append({
            'vendor': 'Courtney Robinson',
            'qbo_vendor': 'Courtney Robinson',
            'category': 'CLEANING FEE',
            'doc_type': 'payment_receipt',
            'date': o['date'],
            'year': 2025,
            'amount': float(o['amount_jmd']),
            'currency': 'JMD',
            'subject': f'Bank transfer - {o.get("memo", "cleaning")}',
            'email_account': 'whatsapp',
            'msg_id': o['reference'],
            'local_file': str(dest),
            's3_url': '',
        })

# Also add 2024 Courtney Robinson transfers
courtney_2024_files = list(Path('/home/ubuntu/upload/courtney_transfers').glob('*_2024_*.png.jpg'))
for f in courtney_2024_files:
    # Parse date from filename: transfer_Courtney Robinson_MM_DD_YYYY_HHMMSS.png.jpg
    m = re.search(r'_(\d{2})_(\d{2})_(2024)_', f.name)
    if m:
        month, day, year = m.groups()
        date_str = f'{year}-{month}-{day}'
        dest = courtney_dir / f'receipt_{date_str}_{f.stem[:20]}.jpg'
        import shutil
        shutil.copy2(f, dest)
        all_evidence.append({
            'vendor': 'Courtney Robinson',
            'qbo_vendor': 'Courtney Robinson',
            'category': 'CLEANING FEE',
            'doc_type': 'payment_receipt',
            'date': date_str,
            'year': 2024,
            'amount': 0,  # Will be filled by image reading
            'currency': 'JMD',
            'subject': 'Bank transfer - cleaning/maintenance',
            'email_account': 'whatsapp',
            'msg_id': '',
            'local_file': str(dest),
            's3_url': '',
        })

# Save manifest
manifest_path = '/home/ubuntu/upload/vendor_evidence_manifest.json'
with open(manifest_path, 'w') as f:
    json.dump(all_evidence, f, indent=2)

print(f'\n=== SUMMARY ===')
print(f'Total evidence documents: {len(all_evidence)}')

from collections import Counter, defaultdict
vendor_counts = Counter(e['vendor'] for e in all_evidence)
type_counts = Counter(e['doc_type'] for e in all_evidence)
year_counts = Counter(e['year'] for e in all_evidence)

print('\nBy vendor:')
for v, c in vendor_counts.most_common():
    bills = sum(1 for e in all_evidence if e['vendor'] == v and e['doc_type'] == 'bill')
    receipts = sum(1 for e in all_evidence if e['vendor'] == v and e['doc_type'] == 'payment_receipt')
    print(f'  {v}: {c} total ({bills} bills, {receipts} receipts)')

print('\nBy year:')
for yr, c in sorted(year_counts.items()):
    print(f'  {yr}: {c} documents')

print('\nBy type:')
for t, c in type_counts.items():
    print(f'  {t}: {c}')

print(f'\nManifest saved to: {manifest_path}')
