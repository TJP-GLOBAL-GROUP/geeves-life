"""
Clean parser for Vivienne WhatsApp chat.
Strategy:
- Parse Vivienne's service itemisation messages (e.g. "Cleaning $12000\nWashing $6000")
- Each line item with a service name + amount is a separate expense record
- Skip lines that say "Total" or "total" (those are running totals, not new charges)
- Skip lines where the amount is very large (>100,000) unless it's a specific named service
- For Tarik's payment confirmations, record them as payments (not expenses)
"""
import re, json
from pathlib import Path
from datetime import datetime

CHAT_FILE = "/home/ubuntu/upload/vivienne_chat/WhatsApp Chat with Vivienne Jamaica Airbnb Cleaner.txt"

with open(CHAT_FILE, 'r', encoding='utf-8', errors='replace') as f:
    raw = f.read()

MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']

# Parse messages
msg_pattern = re.compile(
    r'^(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*([^:]+):\s*(.*?)(?=^\d{1,2}/\d{1,2}/\d{2,4},|\Z)',
    re.MULTILINE | re.DOTALL
)

def parse_date(date_str):
    try:
        if len(date_str.split('/')[-1]) == 2:
            dt = datetime.strptime(date_str, '%m/%d/%y')
        else:
            dt = datetime.strptime(date_str, '%m/%d/%Y')
        return dt
    except:
        return None

messages = []
for m in msg_pattern.finditer(raw):
    date_str = m.group(1)
    sender = m.group(3).strip()
    body = m.group(4).strip()
    dt = parse_date(date_str)
    if dt:
        messages.append({
            'dt': dt,
            'year': dt.year,
            'month': dt.month,
            'date_iso': dt.strftime('%Y-%m-%d'),
            'sender': sender,
            'body': body,
            'is_tarik': 'tarik' in sender.lower(),
            'is_vivienne': 'vivienne' in sender.lower(),
        })

# Service line item patterns
# Match lines like: "Cleaning $12000" or "March 1st Cleaning $12000" or "Sweeping $3000"
SERVICE_KEYWORDS = {
    'CLEANING FEE': ['cleaning', 'clean up', 'cleanup'],
    'LAUNDRY': ['washing', 'wash', 'laundry'],
    'SWEEPING': ['sweeping', 'sweep'],
    'REPAIR COST': ['repair', 'fixing', 'fix', 'plumb', 'gate', 'lock', 'latch', 'pipe', 'regulator', 'board'],
    'CLEANING SUPPLIES': ['bleach', 'tissue', 'paper towel', 'garbage bag', 'soap', 'mop', 'broom',
                          'insect spray', 'toilet brush', 'hand soap', 'washing soap', 'supplies',
                          'shower curtain', 'curtain'],
    'GAS': ['gas tank', 'gas exchange', 'propane', 'gas $'],
    'GRILL CLEANING': ['grill'],
    'LABOUR': ['labor', 'labour', 'assisting guest', 'helper', 'dennis', 'toney', 'tony'],
    'PEST CONTROL': ['pest', 'exterminator', 'alex denilex'],
    'SHOPPING': ['pricesmart', 'price smart', 'shopping'],
    'MAINTENANCE': ['bulb', 'light bulb', 'sunday service'],
}

def get_category(text):
    text_lower = text.lower()
    for cat, kws in SERVICE_KEYWORDS.items():
        for kw in kws:
            if kw in text_lower:
                return cat
    return None

AMOUNT_RE = re.compile(r'\$\s*([\d,]+(?:\.\d{1,2})?)')

def get_amount(text):
    """Extract the first dollar amount from a line."""
    m = AMOUNT_RE.search(text)
    if m:
        return float(m.group(1).replace(',', ''))
    return None

# Also handle "Cleaning $12000" where amount has no comma
AMOUNT_RE2 = re.compile(r'([\d]{4,6})\b')

expenses = []
payments = []
receipt_images = []

for msg in messages:
    if msg['year'] < 2024:
        continue

    body = msg['body']
    date_iso = msg['date_iso']
    year = msg['year']
    month = msg['month']

    # Collect receipt images
    for img_match in re.finditer(r'(IMG-\d{8}-WA\d+\.jpg)', body):
        receipt_images.append({
            'date': date_iso,
            'year': year,
            'month': month,
            'sender': msg['sender'],
            'filename': img_match.group(1),
            'context': body[:100],
        })

    if msg['is_vivienne']:
        # Parse each line for service + amount
        lines = [l.strip() for l in body.split('\n') if l.strip()]
        for line in lines:
            # Skip total/summary lines
            if re.search(r'\btotal\b', line, re.IGNORECASE):
                continue
            # Skip lines that are just a date reference
            if re.match(r'^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d', line, re.IGNORECASE):
                # This might be a date prefix before a service — keep if it has an amount
                pass

            amt = get_amount(line)
            if not amt:
                # Try bare number
                m2 = AMOUNT_RE2.search(line)
                if m2:
                    amt = float(m2.group(1))

            if amt and 500 <= amt <= 200000:
                cat = get_category(line)
                if cat:
                    # Try to extract the actual service date from the line
                    # e.g. "March 1st Cleaning $12000" -> date is March 1
                    service_date = date_iso  # default to message date
                    month_match = re.search(
                        r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})',
                        line, re.IGNORECASE
                    )
                    if month_match:
                        month_name = month_match.group(1).capitalize()
                        day = int(month_match.group(2))
                        month_num = MONTHS.index(month_name)
                        if month_num > 0:
                            # Use the message's year
                            try:
                                service_dt = datetime(year, month_num, day)
                                service_date = service_dt.strftime('%Y-%m-%d')
                            except:
                                pass

                    expenses.append({
                        'date': service_date,
                        'message_date': date_iso,
                        'year': year,
                        'month': month,
                        'description': line[:120],
                        'amount_jmd': amt,
                        'category': cat,
                        'source': 'vivienne_whatsapp',
                    })

    if msg['is_tarik']:
        # Payment confirmations
        amt = get_amount(body)
        if amt and amt >= 5000:
            payments.append({
                'date': date_iso,
                'year': year,
                'month': month,
                'amount_jmd': amt,
                'description': body[:150],
            })

# Deduplicate: same date + amount + category
seen = set()
unique = []
for e in expenses:
    key = (e['date'], e['amount_jmd'], e['category'])
    if key not in seen:
        seen.add(key)
        unique.append(e)

# Group by year for summary
by_year = {}
for e in unique:
    y = str(e['year'])
    by_year.setdefault(y, []).append(e)

print("=== VIVIENNE CHAT — CLEANED EXPENSE RECORDS ===\n")
for year in sorted(by_year.keys()):
    records = sorted(by_year[year], key=lambda x: x['date'])
    total = sum(r['amount_jmd'] for r in records)
    print(f"\n{'='*60}")
    print(f"  {year}: {len(records)} records | JMD {total:,.0f}")
    print(f"{'='*60}")

    by_month = {}
    for r in records:
        by_month.setdefault(r['month'], []).append(r)

    for month in sorted(by_month.keys()):
        mname = MONTHS[month]
        mrecs = by_month[month]
        mtotal = sum(r['amount_jmd'] for r in mrecs)
        print(f"\n  {mname} {year}: JMD {mtotal:,.0f}")
        for r in mrecs:
            print(f"    {r['date']} | {r['category']:<20} | JMD {r['amount_jmd']:>8,.0f} | {r['description'][:55]}")

print(f"\n\n=== CATEGORY TOTALS ===")
cat_totals = {}
for e in unique:
    cat_totals.setdefault(e['category'], {'count': 0, 'total': 0})
    cat_totals[e['category']]['count'] += 1
    cat_totals[e['category']]['total'] += e['amount_jmd']

for cat, d in sorted(cat_totals.items(), key=lambda x: -x[1]['total']):
    print(f"  {cat:<25} {d['count']:>4} records | JMD {d['total']:>12,.0f}")
print(f"  {'GRAND TOTAL':<25} {len(unique):>4} records | JMD {sum(e['amount_jmd'] for e in unique):>12,.0f}")

print(f"\n\n=== RECEIPT IMAGES (2024+): {len(receipt_images)} images ===")
for img in receipt_images[:20]:
    print(f"  {img['date']} | {img['sender'][:15]:<15} | {img['filename']}")
if len(receipt_images) > 20:
    print(f"  ... and {len(receipt_images)-20} more")

# Save
output = {
    'expenses': unique,
    'payments': payments,
    'receipt_images': receipt_images,
    'summary': {
        'total_records': len(unique),
        'total_jmd': sum(e['amount_jmd'] for e in unique),
        'by_year': {y: {'count': len(r), 'total': sum(x['amount_jmd'] for x in r)} for y, r in by_year.items()},
    }
}
with open('/home/ubuntu/upload/vivienne_expenses_clean.json', 'w') as f:
    json.dump(output, f, indent=2)
print("\nSaved to vivienne_expenses_clean.json")
