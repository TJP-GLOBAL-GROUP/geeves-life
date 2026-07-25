"""
Parse the Vivienne Jamaica Airbnb Cleaner WhatsApp chat to extract all
expense records (cleaning, washing, sweeping, repairs, supplies, reimbursements)
for Artiste's Boutique from 2024-2026.
"""
import re, json
from pathlib import Path
from datetime import datetime

CHAT_FILE = "/home/ubuntu/upload/vivienne_chat/WhatsApp Chat with Vivienne Jamaica Airbnb Cleaner.txt"

# Read the chat
with open(CHAT_FILE, 'r', encoding='utf-8', errors='replace') as f:
    raw = f.read()

# Parse all messages
msg_pattern = re.compile(
    r'^(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*([^:]+):\s*(.+?)(?=^\d{1,2}/\d{1,2}/\d{2,4},|\Z)',
    re.MULTILINE | re.DOTALL
)

messages = []
for m in msg_pattern.finditer(raw):
    date_str, time_str, sender, body = m.group(1), m.group(2), m.group(3).strip(), m.group(4).strip()
    # Parse date
    try:
        # Try M/D/YY format
        if len(date_str.split('/')[-1]) == 2:
            dt = datetime.strptime(date_str, '%m/%d/%y')
        else:
            dt = datetime.strptime(date_str, '%m/%d/%Y')
        year = dt.year
        month = dt.month
        day = dt.day
        date_iso = dt.strftime('%Y-%m-%d')
    except:
        year = 0
        month = 0
        day = 0
        date_iso = date_str

    messages.append({
        'date': date_iso,
        'year': year,
        'month': month,
        'day': day,
        'sender': sender,
        'body': body,
        'is_tarik': 'tarik' in sender.lower(),
        'is_vivienne': 'vivienne' in sender.lower(),
    })

# ---- Extract expense records ----
# We look for messages that mention amounts and service types
AMOUNT_PATTERN = re.compile(r'\$\s*([\d,]+(?:\.\d{1,2})?)', re.IGNORECASE)
AMOUNT_PATTERN2 = re.compile(r'([\d,]+)\s*(?:JMD|jmd|j\$)', re.IGNORECASE)

CATEGORIES = {
    'CLEANING FEE': ['cleaning', 'clean'],
    'LAUNDRY': ['washing', 'wash', 'laundry'],
    'SWEEPING': ['sweeping', 'sweep'],
    'REPAIR COST': ['repair', 'fix', 'fixing', 'plumb', 'plumbing', 'gate', 'lock', 'latch', 'pipe', 'regulator', 'bulb', 'grill clean'],
    'CLEANING SUPPLIES': ['bleach', 'tissue', 'paper towel', 'garbage bag', 'soap', 'mop', 'broom', 'insect spray', 'toilet brush', 'hand soap', 'washing soap', 'supplies'],
    'GAS': ['gas', 'propane'],
    'GRILL CLEANING': ['grill'],
    'LABOUR': ['labor', 'labour', 'assistant', 'assisting', 'helper'],
    'PEST CONTROL': ['pest', 'exterminator'],
    'SHOPPING': ['pricesmart', 'price smart', 'shopping'],
}

def categorise(text):
    text_lower = text.lower()
    for cat, keywords in CATEGORIES.items():
        for kw in keywords:
            if kw in text_lower:
                return cat
    return 'CLEANING FEE'  # default for Vivienne messages

def extract_amounts(text):
    amounts = []
    for m in AMOUNT_PATTERN.finditer(text):
        val = float(m.group(1).replace(',', ''))
        amounts.append(val)
    for m in AMOUNT_PATTERN2.finditer(text):
        val = float(m.group(1).replace(',', ''))
        amounts.append(val)
    return amounts

# Build expense records from the chat
# Strategy: look for messages where Vivienne lists services with amounts,
# or where Tarik sends payment confirmations

expenses = []
payments = []  # Tarik's payment confirmations

# Also track messages with image attachments (receipts)
receipt_images = []

for msg in messages:
    if msg['year'] < 2024:
        continue

    body = msg['body']
    date = msg['date']
    year = msg['year']
    month = msg['month']

    # Check for image attachments
    if 'IMG-' in body and '.jpg' in body:
        img_name = re.search(r'(IMG-\d{8}-WA\d+\.jpg)', body)
        if img_name:
            receipt_images.append({
                'date': date,
                'year': year,
                'month': month,
                'sender': msg['sender'],
                'filename': img_name.group(1),
                'context': body,
            })

    # Vivienne's expense itemisations
    if msg['is_vivienne']:
        amounts = extract_amounts(body)
        if amounts:
            # Multi-line service listings
            lines = body.split('\n')
            for line in lines:
                line_amounts = extract_amounts(line)
                if line_amounts:
                    cat = categorise(line)
                    for amt in line_amounts:
                        if amt >= 500:  # filter out noise
                            expenses.append({
                                'date': date,
                                'year': year,
                                'month': month,
                                'description': line.strip(),
                                'amount_jmd': amt,
                                'category': cat,
                                'source': 'vivienne_chat',
                                'sender': 'Vivienne',
                            })

    # Tarik's payment confirmations (he sends receipts as images)
    if msg['is_tarik']:
        amounts = extract_amounts(body)
    if msg['is_tarik'] and amounts:
        for amt in amounts:
            if amt >= 5000:  # meaningful payment amounts
                payments.append({
                    'date': date,
                    'year': year,
                    'month': month,
                    'description': body.strip()[:200],
                    'amount_jmd': amt,
                    'source': 'tarik_payment',
                })

# Deduplicate expenses by date+amount+category
seen = set()
unique_expenses = []
for e in expenses:
    key = (e['date'], e['amount_jmd'], e['category'])
    if key not in seen:
        seen.add(key)
        unique_expenses.append(e)

# Group by year
by_year = {}
for e in unique_expenses:
    y = str(e['year'])
    by_year.setdefault(y, []).append(e)

# Print summary
print("=== VIVIENNE CHAT EXPENSE RECORDS ===\n")
for year in sorted(by_year.keys()):
    records = by_year[year]
    total = sum(r['amount_jmd'] for r in records)
    print(f"\n--- {year} ({len(records)} records, JMD {total:,.0f} total) ---")
    
    # Group by month
    by_month = {}
    for r in records:
        by_month.setdefault(r['month'], []).append(r)
    
    for month in sorted(by_month.keys()):
        month_records = by_month[month]
        month_total = sum(r['amount_jmd'] for r in month_records)
        month_name = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]
        print(f"\n  {month_name} {year}: JMD {month_total:,.0f}")
        for r in month_records:
            print(f"    {r['date']} | {r['category']:<20} | JMD {r['amount_jmd']:>8,.0f} | {r['description'][:60]}")

# Category totals
print("\n\n=== CATEGORY TOTALS (ALL YEARS) ===")
cat_totals = {}
for e in unique_expenses:
    cat_totals.setdefault(e['category'], {'count': 0, 'total': 0})
    cat_totals[e['category']]['count'] += 1
    cat_totals[e['category']]['total'] += e['amount_jmd']

for cat, data in sorted(cat_totals.items(), key=lambda x: -x[1]['total']):
    print(f"  {cat:<25} {data['count']:>4} records | JMD {data['total']:>12,.0f}")

print(f"\n  {'GRAND TOTAL':<25} {len(unique_expenses):>4} records | JMD {sum(e['amount_jmd'] for e in unique_expenses):>12,.0f}")

# Receipt images found
print(f"\n\n=== RECEIPT IMAGES IN CHAT (2024+) ===")
for img in receipt_images:
    print(f"  {img['date']} | {img['sender'][:20]:<20} | {img['filename']} | {img['context'][:60]}")

# Save results
output = {
    'expenses': unique_expenses,
    'payments': payments,
    'receipt_images': receipt_images,
    'summary': {
        'total_records': len(unique_expenses),
        'total_jmd': sum(e['amount_jmd'] for e in unique_expenses),
        'by_year': {y: {'count': len(r), 'total': sum(x['amount_jmd'] for x in r)} for y, r in by_year.items()},
    }
}
with open('/home/ubuntu/upload/vivienne_expenses.json', 'w') as f:
    json.dump(output, f, indent=2)
print("\nSaved to vivienne_expenses.json")
