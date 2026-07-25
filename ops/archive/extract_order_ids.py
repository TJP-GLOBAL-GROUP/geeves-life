"""Extract all order IDs from saved Walmart HTML pages using data-automation-id attributes."""
from bs4 import BeautifulSoup
import os, re, json

upload_dir = './upload'
pages = sorted([f for f in os.listdir(upload_dir) if 'dateFilter_year-1' in f])

all_orders = []
for page_file in pages:
    filepath = os.path.join(upload_dir, page_file)
    with open(filepath, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Find buttons with data-automation-id containing order IDs
    buttons = soup.find_all('button', attrs={'data-automation-id': re.compile(r'view-order-details-link-')})
    
    for btn in buttons:
        auto_id = btn.get('data-automation-id', '')
        order_id = auto_id.replace('view-order-details-link-', '')
        aria_label = btn.get('aria-label', '')
        
        # Extract date and type from aria-label
        # e.g. "View details of Store purchase, Dec 30, 2025 purchase"
        # e.g. "View details of Delivery from store, Delivered on Mar 31"
        label_match = re.search(r'View details of (.+)', aria_label)
        label_info = label_match.group(1) if label_match else aria_label
        
        # Try to find the order total near this button
        # Walk up to the parent card
        parent = btn.parent
        total_text = ''
        for _ in range(10):
            if parent is None:
                break
            text = parent.get_text()
            total_match = re.search(r'Order total \$([0-9,.]+)', text)
            if total_match:
                total_text = total_match.group(1)
                break
            parent = parent.parent
        
        # Find item images in the same card
        images = []
        card_parent = btn.parent
        for _ in range(10):
            if card_parent is None:
                break
            imgs = card_parent.find_all('img', src=True)
            product_imgs = [img['src'] for img in imgs if 'i5.walmartimages.com' in img.get('src', '')]
            if product_imgs:
                images = product_imgs
                break
            card_parent = card_parent.parent
        
        all_orders.append({
            'order_id': order_id,
            'label': label_info,
            'total': total_text,
            'images': images[:6],  # Keep up to 6 thumbnails
            'page_file': page_file
        })

print(f"Extracted {len(all_orders)} orders from {len(pages)} pages")
print(f"Orders with totals: {sum(1 for o in all_orders if o['total'])}")
print(f"Orders without totals: {sum(1 for o in all_orders if not o['total'])}")
print(f"Orders with images: {sum(1 for o in all_orders if o['images'])}")
print()

# Show orders without totals
print("Orders WITHOUT totals:")
for o in all_orders:
    if not o['total']:
        print(f"  ID: {o['order_id']} | {o['label']} | imgs: {len(o['images'])}")

# Save full data
with open('walmart_orders_full.json', 'w') as f:
    json.dump(all_orders, f, indent=2)
print(f"\nSaved to walmart_orders_full.json")
