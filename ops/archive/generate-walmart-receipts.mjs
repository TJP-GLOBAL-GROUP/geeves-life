/**
 * Generate receipt-style images for each Walmart order and upload to S3.
 * Uses the server's storagePut helper pattern via direct S3 API calls.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

config();

const RECEIPTS_DIR = '/home/ubuntu/walmart_receipts';
if (!existsSync(RECEIPTS_DIR)) mkdirSync(RECEIPTS_DIR, { recursive: true });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get all orders
  const [orders] = await conn.execute(
    'SELECT id, orderDate, orderType, totalAmount, seller, location, rawDescription, walmartOrderId, walmartUrl FROM walmart_orders WHERE householdId = ? ORDER BY orderDate DESC',
    ['1S9K7Jw7DtkJJTP2Jgtr6']
  );
  
  console.log(`Generating receipts for ${orders.length} orders...`);
  
  // Generate a Python script that creates all receipt images in batch
  const receiptData = orders.map((o, idx) => ({
    idx,
    id: o.id,
    date: o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unknown',
    type: o.orderType || 'Order',
    amount: o.totalAmount ? `$${Number(o.totalAmount).toFixed(2)}` : 'Amount pending',
    seller: o.seller || 'Walmart',
    location: o.location || '',
    description: (o.rawDescription || '').substring(0, 80),
    orderId: o.walmartOrderId || '',
    url: o.walmartUrl || '',
  }));
  
  writeFileSync('/home/ubuntu/walmart_receipt_data.json', JSON.stringify(receiptData));
  
  // Generate the Python receipt image generator
  const pythonScript = `
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
    # Create receipt image (400x300 white background)
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
    draw.text((20, y + 8), "Source: Walmart.com Order History • Geeves.life Audit Record", fill='#999999', font=font_small)
    
    # Save
    filename = f"{order['id']}.png"
    img.save(os.path.join(RECEIPTS_DIR, filename), 'PNG', optimize=True)

print(f"Generated {len(orders)} receipt images")
`;
  
  writeFileSync('/home/ubuntu/generate_receipts.py', pythonScript);
  
  console.log('Running Python receipt generator...');
  execSync('python3 /home/ubuntu/generate_receipts.py', { stdio: 'inherit' });
  
  // Now upload all receipts using manus-upload-file --webdev
  console.log('Uploading receipts to S3...');
  let uploaded = 0;
  let failed = 0;
  
  const updateBatch = [];
  
  for (const order of receiptData) {
    const filePath = `${RECEIPTS_DIR}/${order.id}.png`;
    if (!existsSync(filePath)) {
      console.error(`Missing: ${filePath}`);
      failed++;
      continue;
    }
    
    try {
      const result = execSync(`manus-upload-file --webdev ${filePath}`, { encoding: 'utf8' }).trim();
      // The output should be the URL
      const url = result.split('\n').pop().trim();
      if (url && url.startsWith('http')) {
        updateBatch.push({ id: order.id, url });
        uploaded++;
      } else {
        console.error(`Bad URL for ${order.id}: ${result}`);
        failed++;
      }
    } catch (err) {
      console.error(`Upload failed for ${order.id}: ${err.message}`);
      failed++;
    }
    
    if (uploaded % 20 === 0) console.log(`  Uploaded ${uploaded}/${receiptData.length}...`);
  }
  
  console.log(`\nUpload complete: ${uploaded} uploaded, ${failed} failed`);
  
  // Update DB with receipt URLs
  console.log('Updating database with receipt URLs...');
  for (const { id, url } of updateBatch) {
    await conn.execute(
      'UPDATE walmart_orders SET rawDescription = CONCAT(COALESCE(rawDescription, ""), ?) WHERE id = ?',
      [`\n[Receipt: ${url}]`, id]
    );
  }
  
  // Save the URL mapping for later use
  writeFileSync('/home/ubuntu/walmart_receipt_urls.json', JSON.stringify(updateBatch, null, 2));
  console.log(`Saved ${updateBatch.length} receipt URLs to walmart_receipt_urls.json`);
  
  conn.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
