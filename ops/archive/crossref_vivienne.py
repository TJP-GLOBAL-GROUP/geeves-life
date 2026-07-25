"""
Cross-reference Vivienne chat receipts against the database.
Find:
1. Bank transfer payments to Vivienne not yet in the DB
2. Store receipts for supplies not yet in the DB
3. Total payments to Vivienne by year (to verify completeness)
"""
import json, re
from collections import defaultdict
from datetime import datetime

# Load AI vision results
with open('/home/ubuntu/read_vivienne_receipts.json') as f:
    vision_data = json.load(f)

results = vision_data['results']

# Load chat text expenses
with open('/home/ubuntu/upload/vivienne_expenses_clean.json') as f:
    chat_data = json.load(f)

# Categorise vision results
bank_transfers = []
store_receipts = []
invoices = []
other_images = []
unreadable = []

for r in results:
    img_path = r['input']
    filename = img_path.split('/')[-1]
    # Extract date from filename: IMG-YYYYMMDD-WAxxxx.jpg
    date_match = re.search(r'IMG-(\d{4})(\d{2})(\d{2})-', filename)
    file_date = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}" if date_match else ''
    year = int(date_match.group(1)) if date_match else 0

    out = r.get('output', {}) or {}
    img_type = out.get('image_type', 'unreadable')
    amount = out.get('amount_jmd', 0) or 0
    date = out.get('date', '') or file_date
    vendor = out.get('vendor', '') or ''
    recipient = out.get('recipient', '') or ''
    description = out.get('description', '') or ''
    category = out.get('category', 'OTHER') or 'OTHER'
    confidence = out.get('confidence', 'low') or 'low'

    record = {
        'filename': filename,
        'file_date': file_date,
        'year': year,
        'image_type': img_type,
        'date': date,
        'amount_jmd': amount,
        'vendor': vendor,
        'recipient': recipient,
        'description': description,
        'category': category,
        'confidence': confidence,
    }

    if img_type == 'bank_transfer':
        bank_transfers.append(record)
    elif img_type == 'store_receipt':
        store_receipts.append(record)
    elif img_type == 'invoice':
        invoices.append(record)
    elif img_type == 'unreadable':
        unreadable.append(record)
    else:
        other_images.append(record)

print(f"=== VISION RESULTS SUMMARY ===")
print(f"Bank transfers: {len(bank_transfers)}")
print(f"Store receipts: {len(store_receipts)}")
print(f"Invoices: {len(invoices)}")
print(f"Other: {len(other_images)}")
print(f"Unreadable: {len(unreadable)}")

# ---- Bank Transfer Analysis ----
print(f"\n\n=== BANK TRANSFERS TO VIVIENNE/COURTNEY ===")
vivienne_transfers = [t for t in bank_transfers if 'vivienne' in (t['recipient'] + t['description']).lower() or 'vivienne' in t['vendor'].lower()]
courtney_transfers = [t for t in bank_transfers if 'courtney' in (t['recipient'] + t['description']).lower() or 'courtney' in t['vendor'].lower()]
other_transfers = [t for t in bank_transfers if t not in vivienne_transfers and t not in courtney_transfers]

print(f"\nVivienne transfers: {len(vivienne_transfers)}")
by_year_v = defaultdict(list)
for t in vivienne_transfers:
    by_year_v[t['year']].append(t)
for yr in sorted(by_year_v.keys()):
    total = sum(t['amount_jmd'] for t in by_year_v[yr])
    print(f"  {yr}: {len(by_year_v[yr])} transfers, JMD {total:,.0f}")
    for t in sorted(by_year_v[yr], key=lambda x: x['file_date']):
        print(f"    {t['file_date']} | JMD {t['amount_jmd']:>8,.0f} | {t['description'][:50]}")

print(f"\nCourtney transfers: {len(courtney_transfers)}")
by_year_c = defaultdict(list)
for t in courtney_transfers:
    by_year_c[t['year']].append(t)
for yr in sorted(by_year_c.keys()):
    total = sum(t['amount_jmd'] for t in by_year_c[yr])
    print(f"  {yr}: {len(by_year_c[yr])} transfers, JMD {total:,.0f}")
    for t in sorted(by_year_c[yr], key=lambda x: x['file_date']):
        print(f"    {t['file_date']} | JMD {t['amount_jmd']:>8,.0f} | {t['description'][:50]}")

if other_transfers:
    print(f"\nOther transfers ({len(other_transfers)}):")
    for t in other_transfers:
        print(f"  {t['file_date']} | JMD {t['amount_jmd']:>8,.0f} | to: {t['recipient']} | {t['description'][:50]}")

# ---- Store Receipts ----
print(f"\n\n=== STORE RECEIPTS (potential supply reimbursements) ===")
for r in sorted(store_receipts, key=lambda x: x['file_date']):
    if r['year'] >= 2024:
        print(f"  {r['file_date']} | {r['vendor']:<25} | JMD {r['amount_jmd']:>8,.0f} | {r['description'][:50]}")

# ---- Invoices ----
if invoices:
    print(f"\n\n=== INVOICES ===")
    for r in sorted(invoices, key=lambda x: x['file_date']):
        if r['year'] >= 2024:
            print(f"  {r['file_date']} | {r['vendor']:<25} | JMD {r['amount_jmd']:>8,.0f} | {r['description'][:50]}")

# ---- Summary by year ----
print(f"\n\n=== TOTAL PAYMENTS TO VIVIENNE BY YEAR (from bank transfers) ===")
all_vivienne = vivienne_transfers
by_year_all = defaultdict(float)
for t in all_vivienne:
    by_year_all[t['year']] += t['amount_jmd']
for yr in sorted(by_year_all.keys()):
    print(f"  {yr}: JMD {by_year_all[yr]:,.0f}")

# Save all useful records for DB cross-reference
useful_records = bank_transfers + store_receipts + invoices
with open('/home/ubuntu/upload/vivienne_vision_records.json', 'w') as f:
    json.dump({
        'bank_transfers': bank_transfers,
        'store_receipts': store_receipts,
        'invoices': invoices,
        'vivienne_transfers': vivienne_transfers,
        'courtney_transfers': courtney_transfers,
    }, f, indent=2)
print("\nSaved to vivienne_vision_records.json")
