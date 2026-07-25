"""
Rebuild the vendor evidence manifest from all files found in vendor_evidence folders.
Then upload to S3 and insert into financial_documents table.
"""
import os
import json
import re
import subprocess
from pathlib import Path
from datetime import datetime

VENDOR_DIR = Path('/home/ubuntu/upload/vendor_evidence')
MANIFEST_PATH = '/home/ubuntu/upload/vendor_evidence_manifest.json'

# Vendor metadata
VENDOR_META = {
    'Courtney_Robinson': {
        'vendor': 'Courtney Robinson',
        'qbo_vendor': 'Courtney Robinson',
        'category': 'CLEANING FEE',
        'currency': 'JMD',
    },
    'Water_Crystal_Pools': {
        'vendor': 'Water Crystal Pools',
        'qbo_vendor': 'Water Crystal Pools',
        'category': 'MAINTENANCE SUPPLIES',
        'currency': 'JMD',
    },
    'TAJ_Property_Tax': {
        'vendor': 'Tax Administration Jamaica',
        'qbo_vendor': 'Tax Administration Jamaica',
        'category': 'PROPERTY TAX',
        'currency': 'JMD',
    },
    'Flow': {
        'vendor': 'Flow Jamaica',
        'qbo_vendor': 'Flow Jamaica',
        'category': 'UTILITIES',
        'currency': 'JMD',
    },
    'Guardian_Life': {
        'vendor': 'Guardian Life Limited',
        'qbo_vendor': 'Guardian Life Limited',
        'category': 'ADMINISTRATIVE EXPENSE',
        'currency': 'JMD',
    },
    'Hardware_and_Lumber': {
        'vendor': 'Hardware & Lumber Ltd',
        'qbo_vendor': 'Hardware & Lumber Ltd',
        'category': 'MAINTENANCE SUPPLIES',
        'currency': 'JMD',
    },
    'JPS': {
        'vendor': 'Jamaica Public Service Co.',
        'qbo_vendor': 'Jamaica Public Service Co.',
        'category': 'UTILITIES',
        'currency': 'JMD',
    },
    'NWC': {
        'vendor': 'National Water Commission',
        'qbo_vendor': 'National Water Commission',
        'category': 'UTILITIES',
        'currency': 'JMD',
    },
    'Digicel': {
        'vendor': 'Digicel Jamaica',
        'qbo_vendor': 'Digicel Jamaica',
        'category': 'UTILITIES',
        'currency': 'JMD',
    },
}

all_evidence = []

for vendor_dir in sorted(VENDOR_DIR.iterdir()):
    if not vendor_dir.is_dir():
        continue
    
    dir_name = vendor_dir.name
    meta = VENDOR_META.get(dir_name, {
        'vendor': dir_name.replace('_', ' '),
        'qbo_vendor': dir_name.replace('_', ' '),
        'category': 'MAINTENANCE SUPPLIES',
        'currency': 'JMD',
    })
    
    files = list(vendor_dir.iterdir())
    print(f'{dir_name}: {len(files)} files')
    
    for f in sorted(files):
        if not f.is_file():
            continue
        
        # Parse date from filename: bill_YYYY-MM-DD_xxx.pdf or receipt_YYYY-MM-DD_xxx.pdf
        fname = f.name
        doc_type = 'bill' if fname.startswith('bill_') else 'payment_receipt'
        
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', fname)
        if date_match:
            date_str = date_match.group(1)
            year = int(date_str[:4])
        else:
            date_str = '2025-01-01'
            year = 2025
        
        all_evidence.append({
            'vendor': meta['vendor'],
            'qbo_vendor': meta['qbo_vendor'],
            'category': meta['category'],
            'doc_type': doc_type,
            'date': date_str,
            'year': year,
            'amount': 0,  # Will be extracted from PDF if needed
            'currency': meta['currency'],
            'subject': f'{meta["vendor"]} {doc_type}',
            'email_account': 'gmail',
            'msg_id': '',
            'local_file': str(f),
            's3_url': '',
        })

print(f'\nTotal evidence documents: {len(all_evidence)}')

from collections import Counter
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

# Save manifest
with open(MANIFEST_PATH, 'w') as f:
    json.dump(all_evidence, f, indent=2)
print(f'\nManifest saved: {MANIFEST_PATH}')
