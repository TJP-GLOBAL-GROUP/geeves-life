import json
from PIL import Image, ImageDraw, ImageFont
import os

RECEIPTS_DIR = '/home/ubuntu/walmart_receipts'
os.makedirs(RECEIPTS_DIR, exist_ok=True)

with open('/home/ubuntu/walmart_receipt_data.json') as f:
    orders = json.load(f)

# Try to use a nice font, fall back to default
try:
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    font_header = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    font_body = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    font_amount = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
except:
    font_title = ImageFont.load_default()
    font_header = font_title
    font_body = font_title
    font_small = font_title
    font_amount = font_title

for order in orders:
    # Create receipt image (500x340 white background)
    img = Image.new('RGB', (500, 340), '#FFFFFF')
    draw = ImageDraw.Draw(img)
    
    # Walmart blue header bar
    draw.rectangle([0, 0, 500, 50], fill='#0071CE')
    draw.text((20, 12), "WALMART", fill='#FFFFFF', font=font_title)
    draw.text((380, 18), "RECEIPT", fill='#FFC220', font=font_header)
    
    # Date and type
    y = 65
    draw.text((20, y), order['date'], fill='#333333', font=font_header)
    draw.text((350, y), order['type'], fill='#666666', font=font_body)
    
    # Divider
    y += 30
    draw.line([(20, y), (480, y)], fill='#E0E0E0', width=1)
    
    # Amount
    y += 15
    draw.text((20, y), "Total:", fill='#666666', font=font_body)
    draw.text((20, y + 20), order['amount'], fill='#0071CE', font=font_amount)
    
    # Seller / Location
    y += 65
    draw.line([(20, y), (480, y)], fill='#E0E0E0', width=1)
    y += 10
    if order['seller']:
        draw.text((20, y), f"Seller: {order['seller']}", fill='#333333', font=font_body)
        y += 20
    if order['location']:
        draw.text((20, y), f"Location: {order['location'][:40]}", fill='#666666', font=font_small)
        y += 18
    
    # Description
    y += 5
    if order['description']:
        draw.text((20, y), order['description'][:60], fill='#666666', font=font_small)
        y += 15
        if len(order['description']) > 60:
            draw.text((20, y), order['description'][60:], fill='#666666', font=font_small)
            y += 15
    
    # Order ID
    y += 10
    draw.line([(20, y), (480, y)], fill='#E0E0E0', width=1)
    y += 8
    if order['orderId']:
        draw.text((20, y), f"Order #: {order['orderId']}", fill='#999999', font=font_small)
        y += 15
    
    # Footer
    y = 310
    draw.rectangle([0, y, 500, 340], fill='#F5F5F5')
    draw.text((20, y + 8), "Source: Walmart.com Order History | Geeves.life Audit Record", fill='#999999', font=font_small)
    
    # Save
    filename = f"{order['id']}.png"
    img.save(os.path.join(RECEIPTS_DIR, filename), 'PNG', optimize=True)

print(f"Generated {len(orders)} receipt images")
