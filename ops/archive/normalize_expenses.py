"""
Normalize 2025 and 2026 expense records into a consistent format
with S3 URLs, then save as expenses_2025_normalized.json and expenses_2026_normalized.json
"""
import json, re
from pathlib import Path
from datetime import datetime

# Load S3 upload results for expense docs
with open('/home/ubuntu/upload/s3_upload_results.json') as f:
    s3_results = json.load(f)

# Build URL lookup by filename
url_map = {}
for item in s3_results:
    if isinstance(item, dict):
        for k, v in item.items():
            if isinstance(v, list):
                for entry in v:
                    if isinstance(entry, dict) and 'filename' in entry and 'url' in entry:
                        url_map[entry['filename']] = entry['url']
            elif isinstance(v, str) and k == 'url':
                # flat structure
                pass

# Also load income S3 URLs for cross-reference
with open('/home/ubuntu/upload/income_s3_urls.json') as f:
    income_urls = json.load(f)
for r in income_urls:
    if r.get('s3Url'):
        url_map[r['filename']] = r['s3Url']

print(f'URL map entries: {len(url_map)}')

def get_url_for_file(filepath):
    """Find S3 URL for a local file path."""
    if not filepath:
        return ''
    fname = Path(filepath).name
    return url_map.get(fname, '')

# ── 2025 expenses ─────────────────────────────────────────────────────────
with open('/home/ubuntu/upload/expenses_2025_compiled.json') as f:
    raw_2025 = json.load(f)

normalized_2025 = []
for e in raw_2025:
    files = e.get('files', []) or [e.get('source_file', '')]
    doc_url = ''
    for f in files:
        u = get_url_for_file(f)
        if u:
            doc_url = u
            break

    # Normalize amount fields
    amount_jmd = e.get('amount', 0) or e.get('amount_jmd', 0) or 0
    amount_usd = e.get('amount_usd', 0) or 0

    normalized_2025.append({
        'date': e.get('date', ''),
        'month': e.get('month', 0),
        'year': 2025,
        'category': e.get('category', e.get('expense', '')).upper(),
        'description': e.get('expense', e.get('subject', e.get('description', ''))),
        'amount_jmd': float(amount_jmd),
        'amount_usd': float(amount_usd),
        'paid_to': e.get('paid_to', e.get('sender', '')),
        'source': e.get('source', ''),
        'docUrl': doc_url,
    })

print(f'2025 expenses normalized: {len(normalized_2025)}')

# ── 2026 expenses ─────────────────────────────────────────────────────────
with open('/home/ubuntu/upload/gmail_2026_expense_results.json') as f:
    raw_2026 = json.load(f)

# Also check if there are any JPS/NWC bills scraped for 2026
# Check the expenses_2026 directory for PDFs
exp_2026_dir = Path('/home/ubuntu/upload/expenses_2026')
if exp_2026_dir.exists():
    pdf_files = list(exp_2026_dir.glob('*.pdf'))
    print(f'2026 expense PDFs in directory: {len(pdf_files)}')
    for pf in pdf_files[:5]:
        print(f'  {pf.name}')

normalized_2026 = []
for e in raw_2026:
    files = e.get('files', [])
    doc_url = ''
    for f in files:
        u = get_url_for_file(f)
        if u:
            doc_url = u
            break

    # Try to get amount from subject
    subject = e.get('subject', '')
    amount_jmd = 0
    amount_usd = 0

    # Maintenance checklists don't have amounts - mark as 0 (labor/service)
    cat = e.get('category', '').upper()
    if 'MAINTENANCE' in cat or 'CLEANING' in cat:
        amount_jmd = 0

    normalized_2026.append({
        'date': e.get('date', ''),
        'month': e.get('month', 0),
        'year': 2026,
        'category': cat or 'MAINTENANCE',
        'description': subject[:100] if subject else e.get('description', ''),
        'amount_jmd': float(amount_jmd),
        'amount_usd': float(amount_usd),
        'paid_to': e.get('sender', ''),
        'source': 'gmail',
        'docUrl': doc_url,
    })

print(f'2026 expenses normalized: {len(normalized_2026)}')

# Save
with open('/home/ubuntu/upload/expenses_2025_normalized.json', 'w') as f:
    json.dump(normalized_2025, f, indent=2)

with open('/home/ubuntu/upload/expenses_2026_normalized.json', 'w') as f:
    json.dump(normalized_2026, f, indent=2)

print('\nSaved normalized expense files.')

# Summary
for year, data in [(2025, normalized_2025), (2026, normalized_2026)]:
    total_jmd = sum(e['amount_jmd'] for e in data)
    total_usd = sum(e['amount_usd'] for e in data)
    print(f'{year}: {len(data)} records | JMD ${total_jmd:,.0f} | USD ${total_usd:,.2f}')
    from collections import Counter
    cats = Counter(e['category'] for e in data)
    for cat, cnt in cats.most_common():
        print(f'  {cat}: {cnt}')
