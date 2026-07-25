"""Merge the text-based CSV (159 orders) with HTML-extracted data (120 orders with IDs + images).
Produces a single comprehensive JSON file for the categorization tool."""
import json, csv, re
from datetime import datetime

# Load HTML-extracted data (has order IDs and images)
with open('walmart_orders_full.json') as f:
    html_orders = json.load(f)

# Deduplicate HTML orders
seen = set()
unique_html = []
for o in html_orders:
    if o['order_id'] not in seen:
        seen.add(o['order_id'])
        unique_html.append(o)

# Parse dates from HTML labels
def parse_html_date(label):
    """Extract date from aria-label like 'Store purchase, Dec 30, 2025 purchase' or 'Delivery, Delivered on Mar 31'"""
    months = {'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
              'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'}
    
    # Pattern: "Mon DD, YYYY"
    m = re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+),\s*(\d{4})', label)
    if m:
        return f"{m.group(3)}-{months[m.group(1)]}-{m.group(2).zfill(2)}"
    
    # Pattern: "on Mon DD" (assumes 2025)
    m = re.search(r'on\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)', label)
    if m:
        return f"2025-{months[m.group(1)]}-{m.group(2).zfill(2)}"
    
    # Pattern: "Picked up on Mon DD"
    m = re.search(r'Picked up on\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)', label)
    if m:
        return f"2025-{months[m.group(1)]}-{m.group(2).zfill(2)}"
    
    return None

# Parse order type from HTML label
def parse_html_type(label):
    if 'Store purchase' in label:
        return 'Store purchase'
    elif 'Curbside pickup' in label:
        return 'Curbside pickup'
    elif 'Delivery from store' in label:
        return 'Delivery from store'
    elif 'Delivery' in label:
        return 'Delivery (3rd party)'
    return 'Unknown'

# Build HTML lookup by (date, type, amount)
html_lookup = {}
for o in unique_html:
    date = parse_html_date(o['label'])
    otype = parse_html_type(o['label'])
    amount = o['total']
    key = (date, otype, amount)
    if key not in html_lookup:
        html_lookup[key] = o

# Also build a looser lookup by (date, amount) for cases where type doesn't match exactly
html_by_date_amount = {}
for o in unique_html:
    date = parse_html_date(o['label'])
    amount = o['total']
    key = (date, amount)
    if key not in html_by_date_amount:
        html_by_date_amount[key] = o

# Load CSV data
with open('walmart_orders_2025.csv', 'r') as f:
    csv_orders = list(csv.DictReader(f))

# Merge: for each CSV order, try to find matching HTML order
merged = []
matched_html_ids = set()

for i, row in enumerate(csv_orders):
    entry = {
        'index': i + 1,
        'date': row.get('date', ''),
        'order_type': row.get('order_type', ''),
        'amount': row.get('amount', ''),
        'location': row.get('location', ''),
        'seller': row.get('seller', ''),
        'refund': row.get('refund', ''),
        'raw': row.get('raw', ''),
        'order_id': None,
        'images': [],
        'walmart_url': None,
    }
    
    # Try to match with HTML data
    # Normalize amount for comparison
    csv_amount = row.get('amount', '').replace(',', '')
    if csv_amount:
        try:
            csv_amount = f"{float(csv_amount):.2f}"
        except:
            csv_amount = ''
    
    date = row.get('date', '')
    otype = row.get('order_type', '')
    
    # Try exact match
    key = (date, otype, csv_amount)
    html_match = html_lookup.get(key)
    
    # Try looser match
    if not html_match:
        key2 = (date, csv_amount)
        html_match = html_by_date_amount.get(key2)
    
    if html_match and html_match['order_id'] not in matched_html_ids:
        entry['order_id'] = html_match['order_id']
        entry['images'] = html_match['images']
        entry['walmart_url'] = f"https://www.walmart.com/orders/{html_match['order_id']}"
        matched_html_ids.add(html_match['order_id'])
    
    merged.append(entry)

# Add any HTML orders that didn't match a CSV row
for o in unique_html:
    if o['order_id'] not in matched_html_ids:
        date = parse_html_date(o['label'])
        otype = parse_html_type(o['label'])
        entry = {
            'index': len(merged) + 1,
            'date': date or '',
            'order_type': otype,
            'amount': o['total'],
            'location': '',
            'seller': '',
            'refund': '',
            'raw': o['label'],
            'order_id': o['order_id'],
            'images': o['images'],
            'walmart_url': f"https://www.walmart.com/orders/{o['order_id']}",
        }
        merged.append(entry)

# Sort by date descending
merged.sort(key=lambda x: x.get('date', '') or '0000', reverse=True)

# Re-index
for i, entry in enumerate(merged):
    entry['index'] = i + 1

# Stats
with_ids = sum(1 for m in merged if m['order_id'])
with_amounts = sum(1 for m in merged if m['amount'])
with_images = sum(1 for m in merged if m['images'])
total_spend = sum(float(m['amount'].replace(',', '')) for m in merged if m['amount'])

print(f"Merged dataset: {len(merged)} orders")
print(f"  With order IDs: {with_ids}")
print(f"  With amounts: {with_amounts}")
print(f"  With images: {with_images}")
print(f"  Total spend: ${total_spend:,.2f}")
print(f"  Date range: {merged[-1]['date']} to {merged[0]['date']}")

# Save
with open('walmart_orders_merged.json', 'w') as f:
    json.dump(merged, f, indent=2)
print(f"\nSaved to walmart_orders_merged.json")
