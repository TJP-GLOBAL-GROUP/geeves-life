"""
Scrape Gmail (tarikp@gmail.com) for 2025 Artiste's Boutique expenses at 7 Dillsbury Avenue.
Downloads PDF attachments and creates email-based PDFs for evidence.
"""

import os
import re
import json
import base64
import requests
import subprocess
from datetime import datetime
from email import message_from_bytes
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

# Load Gmail access token
with open('/home/ubuntu/upload/gmail_access_token.txt') as f:
    ACCESS_TOKEN = f.read().strip()

HEADERS = {'Authorization': f'Bearer {ACCESS_TOKEN}'}
BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

OUTPUT_DIR = '/home/ubuntu/upload/expenses_2025'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Search queries for 2025 Artiste's Boutique expenses
SEARCH_QUERIES = [
    # JPS bills
    ('jps_bills', 'from:jps.com.jm OR subject:"JPS" OR subject:"Jamaica Public Service" after:2024/12/31 before:2026/01/01'),
    ('jps_bills2', 'subject:"light bill" OR subject:"electricity bill" after:2024/12/31 before:2026/01/01'),
    # NWC water bills
    ('nwc_bills', 'from:nwcjamaica.com OR subject:"NWC" OR subject:"National Water" after:2024/12/31 before:2026/01/01'),
    # Cleaning fees
    ('cleaning', 'subject:"cleaning" OR subject:"housekeeper" after:2024/12/31 before:2026/01/01'),
    # Maintenance
    ('maintenance', 'subject:"maintenance" OR subject:"repair" OR subject:"pool" after:2024/12/31 before:2026/01/01'),
    # Digicel/Flow
    ('digicel', 'from:digicel.com OR subject:"Digicel" after:2024/12/31 before:2026/01/01'),
    ('flow', 'from:discoverflow.co OR subject:"Flow" after:2024/12/31 before:2026/01/01'),
    # Insurance
    ('insurance', 'subject:"insurance" OR from:sagicor.com OR from:advantagegeneral.com after:2024/12/31 before:2026/01/01'),
    # Airbnb income
    ('airbnb', 'from:airbnb.com after:2024/12/31 before:2026/01/01'),
    # Property management
    ('property_mgmt', 'subject:"Caribbean Property" OR subject:"property management" after:2024/12/31 before:2026/01/01'),
    # Hardware/fixtures
    ('hardware', 'subject:"Rapid True Value" OR subject:"Irie Hardware" OR subject:"Electrical Depot" after:2024/12/31 before:2026/01/01'),
    # Bill Express
    ('bill_express', 'subject:"Bill Express" OR from:billexpressonline.com after:2024/12/31 before:2026/01/01'),
]


def search_gmail(query, max_results=50):
    """Search Gmail for messages matching query."""
    url = f'{BASE_URL}/messages'
    params = {'q': query, 'maxResults': max_results}
    resp = requests.get(url, headers=HEADERS, params=params)
    if resp.status_code != 200:
        print(f'  Search error: {resp.status_code} - {resp.text[:200]}')
        return []
    data = resp.json()
    return data.get('messages', [])


def get_message(msg_id):
    """Get full message details."""
    url = f'{BASE_URL}/messages/{msg_id}'
    resp = requests.get(url, headers=HEADERS, params={'format': 'full'})
    if resp.status_code != 200:
        return None
    return resp.json()


def get_attachment(msg_id, attachment_id):
    """Download an attachment."""
    url = f'{BASE_URL}/messages/{msg_id}/attachments/{attachment_id}'
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return None
    data = resp.json()
    return base64.urlsafe_b64decode(data.get('data', ''))


def extract_headers(msg):
    """Extract key headers from message."""
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']
    return headers


def get_body_text(msg):
    """Extract plain text body from message."""
    payload = msg.get('payload', {})
    
    def extract_text(part):
        mime_type = part.get('mimeType', '')
        if mime_type == 'text/plain':
            data = part.get('body', {}).get('data', '')
            if data:
                return base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
        elif mime_type == 'text/html':
            data = part.get('body', {}).get('data', '')
            if data:
                html = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
                # Strip HTML tags
                return re.sub(r'<[^>]+>', ' ', html)
        elif 'parts' in part:
            for sub_part in part['parts']:
                text = extract_text(sub_part)
                if text:
                    return text
        return ''
    
    return extract_text(payload)


def create_email_pdf(msg, category, output_path):
    """Create a PDF from email content."""
    headers = extract_headers(msg)
    body = get_body_text(msg)
    
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           rightMargin=inch, leftMargin=inch,
                           topMargin=inch, bottomMargin=inch)
    
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    story.append(Paragraph(f'Email Evidence - {category}', styles['Title']))
    story.append(Spacer(1, 0.2*inch))
    
    # Headers
    story.append(Paragraph(f'<b>From:</b> {headers.get("from", "N/A")}', styles['Normal']))
    story.append(Paragraph(f'<b>To:</b> {headers.get("to", "N/A")}', styles['Normal']))
    story.append(Paragraph(f'<b>Date:</b> {headers.get("date", "N/A")}', styles['Normal']))
    story.append(Paragraph(f'<b>Subject:</b> {headers.get("subject", "N/A")}', styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    # Body
    if body:
        body_clean = body[:3000].replace('<', '&lt;').replace('>', '&gt;')
        for line in body_clean.split('\n'):
            line = line.strip()
            if line:
                try:
                    story.append(Paragraph(line, styles['Normal']))
                except:
                    pass
    
    doc.build(story)
    return output_path


def process_message(msg, category, seen_ids):
    """Process a single message and return expense info."""
    msg_id = msg.get('id')
    if msg_id in seen_ids:
        return None
    seen_ids.add(msg_id)
    
    full_msg = get_message(msg_id)
    if not full_msg:
        return None
    
    headers = extract_headers(full_msg)
    subject = headers.get('subject', 'No Subject')
    date_str = headers.get('date', '')
    sender = headers.get('from', '')
    
    # Parse date
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        msg_date = dt.strftime('%Y-%m-%d')
        msg_year = dt.year
        msg_month = dt.month
    except:
        msg_date = date_str[:10] if date_str else '2025-01-01'
        msg_year = 2025
        msg_month = 1
    
    # Only process 2025 messages
    if msg_year != 2025:
        return None
    
    # Look for PDF attachments
    attachments = []
    payload = full_msg.get('payload', {})
    
    def find_attachments(part):
        if part.get('filename') and part.get('body', {}).get('attachmentId'):
            attachments.append({
                'filename': part['filename'],
                'attachment_id': part['body']['attachmentId'],
                'mime_type': part.get('mimeType', ''),
            })
        for sub_part in part.get('parts', []):
            find_attachments(sub_part)
    
    find_attachments(payload)
    
    # Create safe filename
    safe_date = msg_date.replace('-', '')
    safe_subject = re.sub(r'[^\w\s-]', '', subject)[:40].strip().replace(' ', '_')
    
    saved_files = []
    
    if attachments:
        for att in attachments:
            if att['mime_type'] == 'application/pdf' or att['filename'].lower().endswith('.pdf'):
                att_data = get_attachment(msg_id, att['attachment_id'])
                if att_data:
                    safe_filename = re.sub(r'[^\w.-]', '_', att['filename'])
                    output_path = os.path.join(OUTPUT_DIR, f'{safe_date}_{category}_{safe_filename}')
                    with open(output_path, 'wb') as f:
                        f.write(att_data)
                    saved_files.append(output_path)
                    print(f'    Saved PDF: {os.path.basename(output_path)}')
    
    # If no PDF attachment, create email PDF
    if not saved_files:
        output_path = os.path.join(OUTPUT_DIR, f'{safe_date}_{category}_{safe_subject}_email.pdf')
        try:
            create_email_pdf(full_msg, category, output_path)
            saved_files.append(output_path)
            print(f'    Created email PDF: {os.path.basename(output_path)}')
        except Exception as e:
            print(f'    Error creating PDF: {e}')
    
    return {
        'date': msg_date,
        'year': msg_year,
        'month': msg_month,
        'subject': subject,
        'sender': sender,
        'category': category,
        'files': saved_files,
        'msg_id': msg_id,
    }


def main():
    all_results = []
    seen_ids = set()
    
    print('Scraping Gmail for 2025 Artiste\'s Boutique expenses...\n')
    
    for query_name, query in SEARCH_QUERIES:
        print(f'Searching: {query_name}')
        messages = search_gmail(query)
        print(f'  Found {len(messages)} messages')
        
        for msg in messages:
            result = process_message(msg, query_name, seen_ids)
            if result:
                all_results.append(result)
    
    # Save results
    with open('/home/ubuntu/upload/gmail_2025_results.json', 'w') as f:
        json.dump(all_results, f, indent=2, default=str)
    
    print(f'\n=== SUMMARY ===')
    print(f'Total 2025 expense emails processed: {len(all_results)}')
    
    # Group by category
    from collections import Counter
    cat_counts = Counter(r['category'] for r in all_results)
    for cat, count in sorted(cat_counts.items()):
        print(f'  {cat}: {count}')
    
    # List all saved files
    all_files = []
    for r in all_results:
        all_files.extend(r.get('files', []))
    print(f'\nTotal files saved: {len(all_files)}')
    
    return all_results


if __name__ == '__main__':
    main()
