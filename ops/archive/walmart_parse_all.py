"""
Parse all saved Walmart order HTML pages and extract order summaries.
We'll collect HTML from each page, then parse them all together.
"""
from bs4 import BeautifulSoup
import re
import os
import csv
import json

# Find all saved Walmart order HTML files
upload_dir = '/home/ubuntu/upload'
html_files = sorted([
    os.path.join(upload_dir, f) for f in os.listdir(upload_dir)
    if 'walmart.com_orders' in f and 'dateFilter_year-1' in f and f.endswith('.html')
])

print(f"Found {len(html_files)} HTML files to parse:")
for f in html_files:
    print(f"  {os.path.basename(f)}")

all_orders = []

for html_file in html_files:
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Find all order cards - they typically contain "View details" buttons
    # and have order totals
    
    # Strategy: Find all elements with "Order total" text
    order_total_elements = soup.find_all(string=re.compile(r'Order total'))
    
    for total_el in order_total_elements:
        order = {}
        
        # Get the amount
        amount_match = re.search(r'\$[\d,]+\.\d{2}', total_el.parent.get_text() if total_el.parent else total_el)
        if amount_match:
            order['total'] = amount_match.group()
        
        # Walk up to find the order card container
        card = total_el.parent
        for _ in range(15):  # Walk up max 15 levels
            if card is None:
                break
            card_text = card.get_text(separator=' | ')
            # Check if this container has the date and type info
            if re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}', card_text):
                break
            card = card.parent
        
        if card:
            card_text = card.get_text(separator=' | ')
            
            # Extract date
            date_match = re.search(r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)', card_text)
            if date_match:
                date_str = date_match.group(1)
                if '2025' not in date_str:
                    date_str += ', 2025'
                order['date'] = date_str
            
            # Extract order type
            if 'Store purchase' in card_text:
                order['type'] = 'Store purchase'
            elif 'Curbside pickup' in card_text:
                order['type'] = 'Curbside pickup'
            elif 'Delivery from store' in card_text:
                order['type'] = 'Delivery from store'
            elif 'Delivery' in card_text:
                order['type'] = 'Delivery'
            else:
                order['type'] = 'Unknown'
            
            # Check if canceled
            if 'Canceled' in card_text or 'canceled' in card_text:
                order['status'] = 'Canceled'
            elif 'Delivered' in card_text:
                order['status'] = 'Delivered'
            elif 'Picked up' in card_text:
                order['status'] = 'Picked up'
            else:
                order['status'] = 'Complete'
            
            # Extract delivery date if present
            delivered_match = re.search(r'Delivered on ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})', card_text)
            if delivered_match:
                order['delivery_date'] = delivered_match.group(1) + ', 2025'
            
            picked_match = re.search(r'Picked up on ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})', card_text)
            if picked_match:
                order['delivery_date'] = picked_match.group(1) + ', 2025'
        
        if order.get('total'):
            all_orders.append(order)

print(f"\nExtracted {len(all_orders)} orders total")
print("\nFirst 10 orders:")
for i, o in enumerate(all_orders[:10]):
    print(f"  {i+1}. {o.get('date', 'N/A')} | {o.get('type', 'N/A')} | {o.get('total', 'N/A')} | {o.get('status', 'N/A')}")

# Save to CSV
csv_path = '/home/ubuntu/walmart_orders_2025.csv'
with open(csv_path, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['date', 'type', 'total', 'status', 'delivery_date'])
    writer.writeheader()
    writer.writerows(all_orders)

print(f"\nSaved to {csv_path}")
