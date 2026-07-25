/**
 * Amazon Order Backfill Script
 * 
 * This script:
 * 1. For existing vendor_orders (128 from email_scrape), backfills missing items from CSV
 * 2. For orders in CSV that don't exist in vendor_orders yet, creates them + items
 * 
 * Uses the OrderHistory.csv which has 804 unique orders / 1444 line items.
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';
dotenv.config();

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const AMAZON_VENDOR_ACCOUNT_ID = '1xodoVrwoqtTF1GfMUyQc';
const CSV_PATH = '/home/ubuntu/upload/OrderHistory.csv';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  
  // Parse CSV
  const csv = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true });
  console.log(`Parsed ${records.length} CSV rows`);
  
  // Group by Order ID
  const orderMap = new Map();
  for (const row of records) {
    const orderId = row['Order ID'];
    if (!orderId) continue;
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        orderId,
        orderDate: row['Order Date'] ? new Date(row['Order Date']).getTime() : null,
        currency: row['Currency'] || 'USD',
        paymentMethod: row['Payment Method Type'] || null,
        shippingAddress: row['Shipping Address'] || null,
        totalAmount: row['Total Amount'] ? parseFloat(row['Total Amount']) : null,
        totalDiscounts: row['Total Discounts'] ? parseFloat(row['Total Discounts']) : null,
        items: [],
      });
    }
    const order = orderMap.get(orderId);
    order.items.push({
      asin: row['ASIN'] || null,
      productName: row['Product Name'] || 'Unknown Item',
      quantity: parseInt(row['Original Quantity']) || 1,
      unitPrice: parseFloat(row['Unit Price']) || 0,
      unitPriceTax: parseFloat(row['Unit Price Tax']) || 0,
      shipmentSubtotal: parseFloat(row['Shipment Item Subtotal']) || 0,
      shipmentSubtotalTax: parseFloat(row['Shipment Item Subtotal Tax']) || 0,
      shippingCharge: parseFloat(row['Shipping Charge']) || 0,
      orderStatus: row['Order Status'] || null,
      shipmentStatus: row['Shipment Status'] || null,
      productCondition: row['Product Condition'] || null,
    });
  }
  console.log(`Grouped into ${orderMap.size} unique orders`);
  
  // Get existing vendor_orders by orderNumber
  const [existingRows] = await conn.execute(
    `SELECT id, orderNumber FROM vendor_orders WHERE platform_vo = 'amazon' AND householdId = ?`,
    [HOUSEHOLD_ID]
  );
  const existingMap = new Map(existingRows.map(r => [r.orderNumber, r.id]));
  console.log(`Found ${existingMap.size} existing Amazon vendor_orders in DB`);
  
  // Get existing items to avoid duplicates
  const [existingItems] = await conn.execute(
    `SELECT voi.vendorOrderId, voi.asin, voi.name FROM vendor_order_items voi
     JOIN vendor_orders vo ON voi.vendorOrderId = vo.id
     WHERE vo.platform_vo = 'amazon' AND vo.householdId = ?`,
    [HOUSEHOLD_ID]
  );
  const existingItemKeys = new Set(existingItems.map(i => `${i.vendorOrderId}|${i.asin || i.name}`));
  console.log(`Found ${existingItemKeys.size} existing items`);
  
  let ordersCreated = 0;
  let itemsCreated = 0;
  let itemsSkipped = 0;
  const now = Date.now();
  
  for (const [orderId, order] of orderMap) {
    let vendorOrderId = existingMap.get(orderId);
    
    // If order doesn't exist, create it
    if (!vendorOrderId) {
      vendorOrderId = nanoid();
      // Calculate total from items if not available at order level
      const itemsTotal = order.items.reduce((sum, item) => {
        return sum + (item.shipmentSubtotal + item.shipmentSubtotalTax);
      }, 0);
      const totalAmount = order.totalAmount || itemsTotal || null;
      
      await conn.execute(
        `INSERT INTO vendor_orders (id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo,
         totalAmount, currency_vo, orderDate, deliveryAddress, paymentMethod, importSource_vo, createdAt_vo, updatedAt_vo)
         VALUES (?, ?, ?, ?, 'amazon', 'delivered', ?, ?, ?, ?, ?, 'csv_upload', ?, ?)`,
        [
          vendorOrderId, HOUSEHOLD_ID, AMAZON_VENDOR_ACCOUNT_ID, orderId,
          totalAmount ? totalAmount.toFixed(2) : null,
          order.currency, order.orderDate, order.shippingAddress,
          order.paymentMethod, now, now
        ]
      );
      ordersCreated++;
    }
    
    // Add items for this order
    for (const item of order.items) {
      const itemKey = `${vendorOrderId}|${item.asin || item.productName}`;
      if (existingItemKeys.has(itemKey)) {
        itemsSkipped++;
        continue;
      }
      
      const itemId = nanoid();
      const lineTotal = item.shipmentSubtotal || (item.unitPrice * item.quantity);
      const itemTax = item.shipmentSubtotalTax || (item.unitPriceTax * item.quantity);
      
      await conn.execute(
        `INSERT INTO vendor_order_items (id, vendorOrderId, householdId, name, quantity, unitPrice, lineTotal, itemTax, currency_voi, vendorProductId, asin, createdAt_voi, updatedAt_voi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId, vendorOrderId, HOUSEHOLD_ID, item.productName,
          item.quantity, item.unitPrice.toFixed(2), lineTotal.toFixed(2), itemTax.toFixed(2),
          order.currency, item.asin, item.asin, now, now
        ]
      );
      itemsCreated++;
      existingItemKeys.add(itemKey);
    }
    
    if ((ordersCreated + itemsCreated) % 100 === 0) {
      process.stdout.write(`\r  Progress: ${ordersCreated} orders, ${itemsCreated} items created...`);
    }
  }
  
  console.log(`\n\n══════════════════════════════════════════`);
  console.log(`  AMAZON BACKFILL COMPLETE`);
  console.log(`══════════════════════════════════════════`);
  console.log(`  New orders created: ${ordersCreated}`);
  console.log(`  New items created: ${itemsCreated}`);
  console.log(`  Items skipped (already exist): ${itemsSkipped}`);
  console.log(`  Total orders now: ${existingMap.size + ordersCreated}`);
  console.log(`══════════════════════════════════════════\n`);
  
  await conn.end();
}

main().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
