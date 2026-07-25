import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

config();

const HOUSEHOLD_ID = '1S9K7Jw7DtkJJTP2Jgtr6';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Load the merged orders JSON
  const orders = JSON.parse(readFileSync('/home/ubuntu/walmart_orders_merged.json', 'utf8'));
  console.log(`Loaded ${orders.length} orders from merged JSON`);
  
  let inserted = 0;
  let skipped = 0;
  
  for (const order of orders) {
    const id = randomUUID();
    
    // Parse date
    let orderDate = null;
    if (order.date) {
      const parsed = new Date(order.date + ' 2025');
      if (!isNaN(parsed.getTime())) {
        // The dates are like "Dec 30" - need to figure out the year
        // Most are 2025, but Jan dates at the end might be early 2025
        orderDate = parsed;
      }
    }
    
    // Parse amount
    let totalAmount = null;
    if (order.total) {
      const cleaned = String(order.total).replace(/[$,]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) totalAmount = num;
    }
    
    // Determine if refund
    const isRefund = order.type?.toLowerCase().includes('refund') || 
                     order.raw_description?.toLowerCase().includes('refund') ? 1 : 0;
    
    // Build walmart URL if we have an order ID
    let walmartUrl = null;
    if (order.order_id) {
      walmartUrl = `https://www.walmart.com/orders/${order.order_id}`;
    }
    
    // Thumbnails and items
    const thumbnailUrls = order.images && order.images.length > 0 ? JSON.stringify(order.images) : null;
    const itemNames = order.items && order.items.length > 0 ? JSON.stringify(order.items) : null;
    
    try {
      await conn.execute(
        `INSERT INTO walmart_orders (id, householdId, orderDate, orderType, totalAmount, currency, walmartOrderId, location, seller, isRefund, thumbnailUrls, itemNames, rawDescription, walmartUrl, categorizationStatus)
         VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          id,
          HOUSEHOLD_ID,
          orderDate,
          order.type || null,
          totalAmount,
          order.order_id || null,
          order.location || null,
          order.seller || null,
          isRefund,
          thumbnailUrls,
          itemNames,
          order.raw_description || null,
          walmartUrl
        ]
      );
      inserted++;
    } catch (err) {
      console.error(`Error inserting order: ${err.message}`);
      skipped++;
    }
  }
  
  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
  
  // Verify
  const [rows] = await conn.execute('SELECT COUNT(*) as cnt, SUM(totalAmount) as total FROM walmart_orders WHERE householdId = ?', [HOUSEHOLD_ID]);
  console.log(`DB now has ${rows[0].cnt} orders, total: $${rows[0].total}`);
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
