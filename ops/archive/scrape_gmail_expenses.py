"""
Gmail Expense Evidence Scraper for Artiste's Boutique 2024
=========================================================
Searches tarikp@gmail.com for expense evidence documents,
downloads PDF attachments, generates PDFs for email-only evidence,
and saves everything to /home/ubuntu/upload/expense_docs/

Categories searched:
- JPS electricity bills
- NWC water bills
- Digicel/Flow internet/cable
- Pool/maintenance/repairs
- JUTA/transport
- Insurance
- Mortgage/Scotia
- Airbnb income emails
"""

import os
import sys
import json
import time
import base64
import requests
import datetime
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────
TOKEN_FILE = '/home/ubuntu/upload/gmail_access_token.txt'
OUTPUT_DIR = Path('/home/ubuntu/upload/expense_docs')
RESULTS_FILE = '/home/ubuntu/upload/gmail_expense_results.json'
GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

# Date range for 2024 expense evidence
AFTER = 'after:2023/12/31'
BEFORE = 'before:2025/01/01'

# Expense categories and their search queries
CATEGORIES = {
    'jps_bills': {
        'label': 'JPS Electricity Bills',
        'queries': [
            f'from:jpsco.com {AFTER} {BEFORE}',
            f'from:myamberpay.com JPS {AFTER} {BEFORE}',
            f'subject:"JPS Bill" {AFTER} {BEFORE}',
            f'subject:"Payment Summary for JPS" {AFTER} {BEFORE}',
        ]
    },
    'nwc_water': {
        'label': 'NWC Water Bills',
        'queries': [
            f'from:nwcjamaica.com {AFTER} {BEFORE}',
            f'subject:"NWC" water {AFTER} {BEFORE}',
            f'subject:"National Water Commission" {AFTER} {BEFORE}',
        ]
    },
    'digicel_flow': {
        'label': 'Digicel/Flow Internet & Cable',
        'queries': [
            f'from:digicelgroup.com {AFTER} {BEFORE}',
            f'from:discoverflow.co {AFTER} {BEFORE}',
            f'from:flowjamaica.com {AFTER} {BEFORE}',
            f'subject:digicel invoice {AFTER} {BEFORE}',
            f'subject:flow bill {AFTER} {BEFORE}',
        ]
    },
    'pool_maintenance': {
        'label': 'Pool & Maintenance',
        'queries': [
            f'subject:pool Jamaica {AFTER} {BEFORE}',
            f'subject:maintenance Jamaica {AFTER} {BEFORE}',
            f'subject:repair Jamaica {AFTER} {BEFORE}',
            f'subject:cleaning Jamaica {AFTER} {BEFORE}',
        ]
    },
    'juta_transport': {
        'label': 'JUTA Transport',
        'queries': [
            f'subject:JUTA {AFTER} {BEFORE}',
            f'subject:transport Jamaica {AFTER} {BEFORE}',
            f'subject:taxi Jamaica {AFTER} {BEFORE}',
        ]
    },
    'insurance': {
        'label': 'Insurance',
        'queries': [
            f'subject:insurance Jamaica {AFTER} {BEFORE}',
            f'from:sagicor.com {AFTER} {BEFORE}',
            f'from:ncbinsurance.com {AFTER} {BEFORE}',
            f'subject:"property insurance" {AFTER} {BEFORE}',
        ]
    },
    'mortgage_scotia': {
        'label': 'Mortgage / Scotia',
        'queries': [
            f'from:scotiabank.com mortgage {AFTER} {BEFORE}',
            f'subject:mortgage Jamaica {AFTER} {BEFORE}',
            f'subject:"Scotia" mortgage {AFTER} {BEFORE}',
        ]
    },
    'airbnb_income': {
        'label': 'Airbnb Income',
        'queries': [
            f'from:airbnb.com subject:reservation {AFTER} {BEFORE}',
            f'from:airbnb.com subject:payout {AFTER} {BEFORE}',
            f'from:airbnb.com subject:"confirmation" {AFTER} {BEFORE}',
        ]
    },
    'property_expenses': {
        'label': 'Property Expenses (General)',
        'queries': [
            f'subject:"Artiste" Jamaica {AFTER} {BEFORE}',
            f'subject:"Bohemian" Jamaica {AFTER} {BEFORE}',
            f'subject:invoice Jamaica {AFTER} {BEFORE}',
            f'subject:receipt Jamaica {AFTER} {BEFORE}',
        ]
    },
}

# ─── Gmail API helpers ────────────────────────────────────────────────────────

def get_headers():
    with open(TOKEN_FILE) as f:
        token = f.read().strip()
    return {'Authorization': f'Bearer {token}'}

def search_messages(query, max_results=100):
    """Search Gmail and return list of message IDs."""
    all_msgs = []
    page_token = None
    
    while True:
        params = {'q': query, 'maxResults': min(max_results - len(all_msgs), 100)}
        if page_token:
            params['pageToken'] = page_token
        
        resp = requests.get(f'{GMAIL_API}/messages', headers=get_headers(), params=params)
        if resp.status_code == 401:
            print(f'  [ERROR] 401 Unauthorized - token may be expired')
            return all_msgs
        if resp.status_code != 200:
            print(f'  [ERROR] Search failed: {resp.status_code} {resp.text[:100]}')
            return all_msgs
        
        data = resp.json()
        msgs = data.get('messages', [])
        all_msgs.extend(msgs)
        
        page_token = data.get('nextPageToken')
        if not page_token or len(all_msgs) >= max_results:
            break
        
        time.sleep(0.1)  # Rate limiting
    
    return all_msgs

def get_message(msg_id):
    """Get full message details."""
    resp = requests.get(
        f'{GMAIL_API}/messages/{msg_id}',
        headers=get_headers(),
        params={'format': 'full'}
    )
    if resp.status_code != 200:
        return None
    return resp.json()

def get_attachment(msg_id, attachment_id):
    """Download attachment data."""
    resp = requests.get(
        f'{GMAIL_API}/messages/{msg_id}/attachments/{attachment_id}',
        headers=get_headers()
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    # Gmail returns URL-safe base64
    return base64.urlsafe_b64decode(data['data'] + '==')

def extract_headers(msg):
    """Extract key headers from message."""
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        name = h['name'].lower()
        if name in ('subject', 'from', 'to', 'date'):
            headers[name] = h['value']
    return headers

def extract_body_text(msg):
    """Extract plain text body from message."""
    def get_text_from_part(part):
        if part.get('mimeType') == 'text/plain':
            data = part.get('body', {}).get('data', '')
            if data:
                return base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
        if part.get('mimeType') == 'text/html':
            data = part.get('body', {}).get('data', '')
            if data:
                html = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
                # Strip HTML tags
                import re
                text = re.sub(r'<[^>]+>', ' ', html)
                text = re.sub(r'\s+', ' ', text).strip()
                return text
        return ''
    
    payload = msg.get('payload', {})
    
    # Single part
    if payload.get('mimeType', '').startswith('text/'):
        return get_text_from_part(payload)
    
    # Multi-part
    texts = []
    for part in payload.get('parts', []):
        text = get_text_from_part(part)
        if text:
            texts.append(text)
        # Nested parts
        for subpart in part.get('parts', []):
            text = get_text_from_part(subpart)
            if text:
                texts.append(text)
    
    return '\n'.join(texts)

def get_attachments_info(msg):
    """Get list of PDF attachments from message."""
    attachments = []
    
    def scan_parts(parts):
        for part in parts:
            if part.get('filename') and part.get('body', {}).get('attachmentId'):
                mime = part.get('mimeType', '')
                filename = part.get('filename', '')
                if mime == 'application/pdf' or filename.lower().endswith('.pdf'):
                    attachments.append({
                        'filename': filename,
                        'mimeType': mime,
                        'size': part.get('body', {}).get('size', 0),
                        'attachmentId': part['body']['attachmentId'],
                    })
            # Recurse
            if part.get('parts'):
                scan_parts(part['parts'])
    
    payload = msg.get('payload', {})
    if payload.get('parts'):
        scan_parts(payload['parts'])
    
    return attachments

def generate_email_pdf(headers, body_text, output_path):
    """Generate a PDF from email content."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.colors import HexColor
    
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=14,
        spaceAfter=12,
    )
    header_style = ParagraphStyle(
        'Header',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#444444'),
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=6,
        leading=14,
    )
    
    story = []
    
    # Title
    subject = headers.get('subject', 'Email Evidence')
    story.append(Paragraph(f"Email Evidence: {subject[:80]}", title_style))
    story.append(Spacer(1, 0.1 * inch))
    
    # Headers
    for key in ('from', 'to', 'date', 'subject'):
        val = headers.get(key, '')
        if val:
            story.append(Paragraph(f"<b>{key.title()}:</b> {val[:120]}", header_style))
    
    story.append(Spacer(1, 0.2 * inch))
    
    # Body
    if body_text:
        # Split into paragraphs and limit length
        paragraphs = body_text[:5000].split('\n')
        for para in paragraphs:
            para = para.strip()
            if para:
                # Escape XML special chars
                para = para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                try:
                    story.append(Paragraph(para, body_style))
                except Exception:
                    pass
    
    doc.build(story)
    return output_path

# ─── Main scraping logic ──────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    all_results = {}
    seen_msg_ids = set()
    
    for category, config in CATEGORIES.items():
        print(f'\n{"="*60}')
        print(f'Category: {config["label"]}')
        print(f'{"="*60}')
        
        cat_dir = OUTPUT_DIR / category
        cat_dir.mkdir(exist_ok=True)
        
        category_results = []
        
        for query in config['queries']:
            print(f'\n  Query: {query}')
            msgs = search_messages(query, max_results=50)
            print(f'  Found: {len(msgs)} messages')
            
            for msg_ref in msgs:
                msg_id = msg_ref['id']
                if msg_id in seen_msg_ids:
                    continue
                seen_msg_ids.add(msg_id)
                
                # Get full message
                msg = get_message(msg_id)
                if not msg:
                    continue
                
                headers = extract_headers(msg)
                subject = headers.get('subject', '')
                date_str = headers.get('date', '')
                sender = headers.get('from', '')
                
                # Parse date
                try:
                    internal_date = int(msg.get('internalDate', 0))
                    msg_date = datetime.datetime.fromtimestamp(internal_date / 1000)
                    date_formatted = msg_date.strftime('%Y-%m-%d')
                except Exception:
                    date_formatted = 'unknown'
                
                print(f'\n    [{date_formatted}] {subject[:60]}')
                print(f'    From: {sender[:50]}')
                
                # Check for PDF attachments
                pdf_attachments = get_attachments_info(msg)
                
                result = {
                    'msg_id': msg_id,
                    'thread_id': msg.get('threadId'),
                    'date': date_formatted,
                    'subject': subject,
                    'from': sender,
                    'category': category,
                    'query': query,
                    'documents': [],
                }
                
                if pdf_attachments:
                    print(f'    PDF attachments: {len(pdf_attachments)}')
                    for att in pdf_attachments:
                        print(f'      - {att["filename"]} ({att["size"]} bytes)')
                        
                        # Download attachment
                        att_data = get_attachment(msg_id, att['attachmentId'])
                        if att_data:
                            safe_date = date_formatted.replace('-', '')
                            safe_name = att['filename'].replace('/', '_').replace(' ', '_')
                            output_path = cat_dir / f'{safe_date}_{safe_name}'
                            
                            with open(output_path, 'wb') as f:
                                f.write(att_data)
                            
                            print(f'      Saved: {output_path}')
                            result['documents'].append({
                                'type': 'attachment',
                                'filename': att['filename'],
                                'local_path': str(output_path),
                                'size': len(att_data),
                            })
                        
                        time.sleep(0.1)
                else:
                    # Generate PDF from email content
                    body_text = extract_body_text(msg)
                    if body_text or subject:
                        safe_date = date_formatted.replace('-', '')
                        safe_subject = ''.join(c if c.isalnum() or c in '-_' else '_' for c in subject[:40])
                        output_path = cat_dir / f'{safe_date}_{safe_subject}_email.pdf'
                        
                        try:
                            generate_email_pdf(headers, body_text, output_path)
                            print(f'    Generated PDF: {output_path.name}')
                            result['documents'].append({
                                'type': 'email_pdf',
                                'filename': output_path.name,
                                'local_path': str(output_path),
                                'size': output_path.stat().st_size,
                            })
                        except Exception as e:
                            print(f'    [ERROR] PDF generation failed: {e}')
                
                category_results.append(result)
                time.sleep(0.2)  # Rate limiting
        
        all_results[category] = category_results
        print(f'\n  Total for {category}: {len(category_results)} emails, {sum(len(r["documents"]) for r in category_results)} documents')
    
    # Save results
    with open(RESULTS_FILE, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f'\n\n{"="*60}')
    print('SUMMARY')
    print(f'{"="*60}')
    total_emails = sum(len(v) for v in all_results.values())
    total_docs = sum(len(r['documents']) for v in all_results.values() for r in v)
    print(f'Total emails processed: {total_emails}')
    print(f'Total documents saved: {total_docs}')
    print(f'Results saved to: {RESULTS_FILE}')
    
    for cat, results in all_results.items():
        docs = sum(len(r['documents']) for r in results)
        print(f'  {cat}: {len(results)} emails, {docs} documents')

if __name__ == '__main__':
    main()
