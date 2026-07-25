"""
Search all Gmail accounts for hardware store and vendor emails
related to Artiste's Boutique (2024-2025 focus).
"""
import json, os, re, base64, requests
from pathlib import Path
from datetime import datetime
from fpdf import FPDF

TOKENS_FILE = '/home/ubuntu/upload/all_gmail_tokens.json'
OUTPUT_DIR = '/home/ubuntu/upload/vendor_emails'
RESULTS_FILE = '/home/ubuntu/upload/vendor_email_results.json'

Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

with open(TOKENS_FILE) as f:
    tokens = json.load(f)

VENDORS = [
    # Hardware & building supplies
    ('irie hardware', 'MAINTENANCE SUPPLIES'),
    ('irie hardware ltd', 'MAINTENANCE SUPPLIES'),
    ('atl', 'MAINTENANCE SUPPLIES'),
    ('gas pro', 'MAINTENANCE SUPPLIES'),
    ('hardware lumber', 'MAINTENANCE SUPPLIES'),
    ('super valu', 'MAINTENANCE SUPPLIES'),
    ('pricesmart', 'MAINTENANCE SUPPLIES'),
    # Pool
    ('water crystal', 'MAINTENANCE SUPPLIES'),
    ('pool', 'MAINTENANCE SUPPLIES'),
    # Home & garden
    ('home and garden', 'CLEANING FEE'),
    ('home garden care', 'CLEANING FEE'),
    # Cooling/AC
    ('modern power', 'UTILITIES'),
    ('cooling technology', 'UTILITIES'),
    # Insurance
    ('guardian life', 'ADMINISTRATIVE EXPENSE'),
    ('sagicor', 'ADMINISTRATIVE EXPENSE'),
    ('jn general', 'ADMINISTRATIVE EXPENSE'),
    # Internet/TV
    ('flow jamaica', 'UTILITIES'),
    ('columbus communications', 'UTILITIES'),
    # Tax
    ('tax administration', 'PROPERTY TAX'),
    ('taj', 'PROPERTY TAX'),
    # Misc
    ('courtney robinson', 'CLEANING FEE'),
    ('dillsbury', 'REPAIR COST'),
    ('7 dillsbury', 'REPAIR COST'),
]

def search_gmail(token, query, max_results=50):
    """Search Gmail and return message list."""
    url = 'https://www.googleapis.com/gmail/v1/users/me/messages'
    params = {'q': query, 'maxResults': max_results}
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, params=params, timeout=15)
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get('messages', [])

def get_message(token, msg_id):
    """Get full message details."""
    url = f'https://www.googleapis.com/gmail/v1/users/me/messages/{msg_id}'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, 
                        params={'format': 'full'}, timeout=15)
    if resp.status_code != 200:
        return None
    return resp.json()

def extract_body(msg):
    """Extract text body from message."""
    def get_parts(payload):
        if payload.get('body', {}).get('data'):
            try:
                return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
            except:
                return ''
        for part in payload.get('parts', []):
            text = get_parts(part)
            if text:
                return text
        return ''
    return get_parts(msg.get('payload', {}))

def get_headers(msg):
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']
    return headers

def create_email_pdf(email_data, output_path):
    """Create a PDF from email data."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 14)
    
    subject = email_data.get('subject', 'No Subject')
    # Strip non-latin1 chars
    subject = subject.encode('latin-1', errors='replace').decode('latin-1')
    pdf.cell(0, 10, subject[:80], ln=True)
    
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 6, f"From: {email_data.get('from', '')[:80].encode('latin-1', errors='replace').decode('latin-1')}", ln=True)
    pdf.cell(0, 6, f"Date: {email_data.get('date', '')}", ln=True)
    pdf.cell(0, 6, f"Account: {email_data.get('account', '')}", ln=True)
    pdf.ln(5)
    
    body = email_data.get('body', '')[:3000]
    body = body.encode('latin-1', errors='replace').decode('latin-1')
    pdf.set_font('Helvetica', '', 9)
    pdf.multi_cell(0, 5, body)
    
    pdf.output(output_path)

all_results = []
seen_ids = set()

for account, token in tokens.items():
    if not token:
        continue
    print(f"\nSearching {account}...")
    
    for vendor_term, category in VENDORS:
        # Build query - search for vendor in 2024-2025
        query = f'"{vendor_term}" after:2024/01/01 before:2026/01/01'
        
        try:
            messages = search_gmail(token, query, max_results=20)
            if not messages:
                continue
            
            print(f"  {vendor_term}: {len(messages)} emails")
            
            for msg_ref in messages[:10]:  # Limit to 10 per vendor per account
                msg_id = msg_ref['id']
                if msg_id in seen_ids:
                    continue
                seen_ids.add(msg_id)
                
                msg = get_message(token, msg_id)
                if not msg:
                    continue
                
                headers = get_headers(msg)
                subject = headers.get('subject', 'No Subject')
                date_str = headers.get('date', '')
                from_addr = headers.get('from', '')
                
                # Parse date
                try:
                    # Try to extract year from date string
                    year_match = re.search(r'20(24|25)', date_str)
                    year = int('20' + year_match.group(1)) if year_match else 2024
                    
                    # Try to parse full date
                    for fmt in ['%a, %d %b %Y', '%d %b %Y', '%Y-%m-%d']:
                        try:
                            dt = datetime.strptime(date_str[:len(fmt)+5].strip(), fmt)
                            date_parsed = dt.strftime('%Y-%m-%d')
                            break
                        except:
                            date_parsed = f"{year}-01-01"
                except:
                    date_parsed = '2024-01-01'
                    year = 2024
                
                body = extract_body(msg)
                
                # Extract amount from body
                amount = 0
                amount_match = re.search(r'(?:total|amount|paid|balance)[:\s]*(?:JMD|USD|J\$|\$)?\s*([\d,]+\.?\d*)', 
                                        body, re.IGNORECASE)
                if amount_match:
                    try:
                        amount = float(amount_match.group(1).replace(',', ''))
                    except:
                        pass
                
                # Create PDF
                vendor_slug = vendor_term.replace(' ', '_').replace('/', '_')
                pdf_name = f"{date_parsed}_{vendor_slug}_{msg_id[:8]}.pdf"
                pdf_path = os.path.join(OUTPUT_DIR, pdf_name)
                
                email_data = {
                    'subject': subject,
                    'from': from_addr,
                    'date': date_str,
                    'date_parsed': date_parsed,
                    'year': year,
                    'account': account,
                    'body': body[:2000],
                    'vendor_term': vendor_term,
                    'category': category,
                    'amount': amount,
                    'local_file': pdf_path,
                    'msg_id': msg_id,
                }
                
                try:
                    create_email_pdf(email_data, pdf_path)
                    all_results.append(email_data)
                except Exception as e:
                    print(f"    PDF error for {msg_id}: {e}")
                    
        except Exception as e:
            print(f"  Error searching {vendor_term}: {e}")

print(f"\n=== VENDOR EMAIL SEARCH COMPLETE ===")
print(f"Total emails found: {len(all_results)}")

# Group by vendor
from collections import Counter
vc = Counter(r['vendor_term'] for r in all_results)
for v, c in vc.most_common():
    print(f"  {v}: {c}")

# Save results
with open(RESULTS_FILE, 'w') as f:
    json.dump(all_results, f, indent=2, default=str)

print(f"\nResults saved to {RESULTS_FILE}")
print(f"PDFs saved to {OUTPUT_DIR}")
