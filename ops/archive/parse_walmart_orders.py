#!/usr/bin/env python3
"""Parse walmart_orders_raw.md into a structured CSV for statement matching."""

import re
import csv
from datetime import datetime

orders = []

with open('/home/ubuntu/walmart_orders_raw.md', 'r') as f:
    content = f.read()

# Split by page sections
pages = re.split(r'## Page \d+', content)

for page in pages:
    lines = page.strip().split('\n')
    for line in lines:
        if not line.startswith('- '):
            continue
        
        entry = line[2:].strip()
        
        # Skip summary/status lines
        if any(skip in entry for skip in ['Total pages', 'Date range:', 'Approximately', 'Mix of:', 'Locations:', 'Status:', 'Remaining:', 'Estimated', 'Progress:', 'HTML files']):
            continue
        
        # Extract order type
        order_type = 'Unknown'
        if 'Delivery from store' in entry:
            order_type = 'Delivery from store'
        elif 'Delivery' in entry:
            order_type = 'Delivery (3rd party)'
        elif 'Curbside pickup' in entry:
            order_type = 'Curbside pickup'
        elif 'Store purchase' in entry:
            order_type = 'Store purchase'
        
        # Extract date - multiple patterns
        date_str = None
        
        # Pattern: "Delivered on Mon DD" or "Picked up on Mon DD"
        date_match = re.search(r'(?:Delivered|Picked up) on (\w+ \d+)', entry)
        if date_match:
            date_str = date_match.group(1) + ', 2025'
        
        # Pattern: "Mon DD, 2025 purchase"
        if not date_str:
            date_match = re.search(r'(\w+ \d+, 2025) purchase', entry)
            if date_match:
                date_str = date_match.group(1)
        
        # Parse the date
        parsed_date = None
        if date_str:
            try:
                parsed_date = datetime.strptime(date_str, '%b %d, %Y')
            except ValueError:
                try:
                    parsed_date = datetime.strptime(date_str, '%B %d, %Y')
                except ValueError:
                    parsed_date = None
        
        # Extract amount
        amount = None
        amount_match = re.search(r'Order total \$([0-9,]+\.\d+)', entry)
        if amount_match:
            amount = float(amount_match.group(1).replace(',', ''))
        
        # Extract location
        location = ''
        loc_match = re.search(r'(?:Watkins glen|Horseheads|Vienna) Supercenter at [^,]+', entry)
        if loc_match:
            location = loc_match.group(0)
        
        # Extract seller info
        seller = 'Walmart'
        seller_match = re.search(r'Sold (?:by|and shipped by) ([^,]+?)(?:,| Fulfilled)', entry)
        if seller_match:
            seller = seller_match.group(1).strip()
        
        # Check for refund
        refund = ''
        refund_match = re.search(r'Refund issued on .+?\)', entry)
        if refund_match:
            refund = 'Yes'
        
        orders.append({
            'date': parsed_date.strftime('%Y-%m-%d') if parsed_date else '',
            'order_type': order_type,
            'amount': amount if amount else '',
            'location': location,
            'seller': seller,
            'refund': refund,
            'raw': entry[:100]
        })

# Sort by date
orders.sort(key=lambda x: x['date'] if x['date'] else '9999-99-99')

# Write CSV
csv_path = '/home/ubuntu/walmart_orders_2025.csv'
with open(csv_path, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['date', 'order_type', 'amount', 'location', 'seller', 'refund', 'raw'])
    writer.writeheader()
    writer.writerows(orders)

print(f"Total orders parsed: {len(orders)}")
print(f"Orders with amounts: {sum(1 for o in orders if o['amount'])}")
print(f"Orders without amounts: {sum(1 for o in orders if not o['amount'])}")
print(f"Total spend (where known): ${sum(float(o['amount']) for o in orders if o['amount']):,.2f}")
print(f"Date range: {orders[0]['date']} to {orders[-1]['date']}")
print(f"\nCSV saved to: {csv_path}")

# Summary by type
from collections import Counter
type_counts = Counter(o['order_type'] for o in orders)
print(f"\nBy type:")
for t, c in type_counts.most_common():
    print(f"  {t}: {c}")
