"""
Compile all 2025 Artiste's Boutique expense records from Gmail and bank statements.
"""

import json
import re
from collections import defaultdict

# Load Gmail results
with open('/home/ubuntu/upload/gmail_2025_results.json') as f:
    gmail_results = json.load(f)

# Load bank statement transactions
with open('/home/ubuntu/upload/property_transactions.json') as f:
    bank_data = json.load(f)

bank_txns = [t for t in bank_data['transactions'] if t.get('year') == 2025]

# Build 2025 expense records
expenses_2025 = []

# 1. JPS BILLS - extract from email subjects
jps_pattern = re.compile(r'Amount:\s*\$?([\d,]+\.?\d*)', re.IGNORECASE)
for r in gmail_results:
    if r['category'] == 'jps_bills' and 'A/C#: 1096579-323196' in r.get('subject', ''):
        m = jps_pattern.search(r['subject'])
        if m:
            try:
                amount = float(m.group(1).replace(',', ''))
                expenses_2025.append({
                    'date': r['date'],
                    'month': r['month'],
                    'year': r['year'],
                    'expense': 'JPS Light Bill',
                    'category': 'UTILITIES',
                    'amount': amount,
                    'paid_to': 'JPS',
                    'paid_from': 'TARIK',
                    'source_file': r['files'][0] if r.get('files') else '',
                    'source': 'gmail_jps',
                })
            except ValueError:
                pass

# 2. NWC BILLS - extract from email subjects
nwc_pattern = re.compile(r'Amount:\s*\$?([\d,]+\.?\d*)', re.IGNORECASE)
for r in gmail_results:
    if r['category'] == 'nwc_bills' and 'A/C#: 1027691-1027681' in r.get('subject', ''):
        m = nwc_pattern.search(r['subject'])
        if m:
            try:
                amount = float(m.group(1).replace(',', ''))
                expenses_2025.append({
                    'date': r['date'],
                    'month': r['month'],
                    'year': r['year'],
                    'expense': 'NWC Water Bill',
                    'category': 'UTILITIES',
                    'amount': amount,
                    'paid_to': 'NWC',
                    'paid_from': 'TARIK',
                    'source_file': r['files'][0] if r.get('files') else '',
                    'source': 'gmail_nwc',
                })
            except ValueError:
                pass

# 3. DIGICEL from bank statements (more reliable than email subjects)
for t in bank_txns:
    if 'DIGICEL' in t['description'].upper():
        expenses_2025.append({
            'date': t['date'],
            'month': t['month'],
            'year': t['year'],
            'expense': 'Digicel Mobile',
            'category': 'UTILITIES',
            'amount': t['amount_jmd'],
            'paid_to': 'Digicel',
            'paid_from': 'TARIK (CC)',
            'source_file': '',
            'source': 'bank_statement',
        })

# 4. MAINTENANCE from bank statements
for t in bank_txns:
    if t['category'] == 'MAINTENANCE' and 'SECRET GARDENS' not in t['description'].upper():
        expenses_2025.append({
            'date': t['date'],
            'month': t['month'],
            'year': t['year'],
            'expense': t['description'][:60],
            'category': 'MAINTENANCE',
            'amount': t['amount_jmd'],
            'paid_to': t.get('paid_to', 'Contractor'),
            'paid_from': 'TARIK (CC)',
            'source_file': '',
            'source': 'bank_statement',
        })

# 5. NWC from bank statements (for months not in Gmail)
for t in bank_txns:
    if 'NWC' in t['description'].upper() and t['amount_jmd'] > 1000:
        # Check if we already have this month from Gmail
        month = t['month']
        already_have = any(
            e['category'] == 'UTILITIES' and e['paid_to'] == 'NWC' and e['month'] == month
            for e in expenses_2025
        )
        if not already_have:
            expenses_2025.append({
                'date': t['date'],
                'month': t['month'],
                'year': t['year'],
                'expense': 'NWC Water Bill',
                'category': 'UTILITIES',
                'amount': t['amount_jmd'],
                'paid_to': 'NWC',
                'paid_from': 'TARIK (CC)',
                'source_file': '',
                'source': 'bank_statement',
            })

# Sort by date
expenses_2025.sort(key=lambda x: x['date'])

# Save
with open('/home/ubuntu/upload/expenses_2025_compiled.json', 'w') as f:
    json.dump(expenses_2025, f, indent=2, default=str)

print(f'Total 2025 expense records: {len(expenses_2025)}')
print()

# Summary by category and month
by_cat = defaultdict(float)
by_month = defaultdict(float)
for e in expenses_2025:
    by_cat[e['category']] += e['amount']
    by_month[e['month']] += e['amount']

print('=== BY CATEGORY ===')
for cat, total in sorted(by_cat.items()):
    count = sum(1 for e in expenses_2025 if e['category'] == cat)
    print(f'  {cat}: {count} records, JMD ${total:,.2f}')

print()
print('=== BY MONTH ===')
month_names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
for month in sorted(by_month.keys()):
    total = by_month[month]
    count = sum(1 for e in expenses_2025 if e['month'] == month)
    print(f'  {month_names[month]}-2025: {count} records, JMD ${total:,.2f}')

print()
print('=== DETAILED RECORDS ===')
for e in expenses_2025:
    print(f'{e["date"]} | {e["category"]} | {e["expense"][:50]} | JMD ${e["amount"]:,.2f} | {e["source"]}')
