import { getDb } from '../server/db.ts';
import { bankAccounts, vendorOrders, vendorOrderItems } from '../drizzle/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const USER_ID = 1;
const AMAZON_VENDOR_ACCOUNT_ID = '1xodoVrwoqtTF1GfMUyQc';

// Column names from DB: id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo,
// subtotal, taxAmount, shippingAmount, totalAmount, discountAmount, currency_vo,
// orderDate, deliveryDate, trackingNumbers, deliveryAddress, paymentMethod, paymentCardLast4,
// importSource_vo, rawImportData, legacyOrderId, legacyWalmartOrderId, notes, createdAt_vo, updatedAt_vo

async function main() {
  const db = await getDb();

  // Step 1: Get existing bank accounts
  const existingAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, USER_ID));
  console.log('=== EXISTING BANK ACCOUNTS ===');
  for (const a of existingAccounts) {
    console.log(`  ID ${a.id}: ${a.institution} - ${a.accountName} (last4: ${a.lastFourDigits})`);
  }

  // Step 2: Parse Amazon CSV
  const csvData = readFileSync('/home/ubuntu/upload/OrderHistory.csv', 'utf-8');
  const records = parse(csvData, { columns: true, skip_empty_lines: true, bom: true }) as any[];
  console.log(`\n=== AMAZON CSV: ${records.length} line items ===`);

  // Step 3: Get existing order numbers to avoid duplicates
  const [existingRows] = await db.execute(sql`SELECT orderNumber FROM vendor_orders WHERE vendorAccountId = ${AMAZON_VENDOR_ACCOUNT_ID}`);
  const existingOrderNumbers = new Set((existingRows as any[]).map((r: any) => r.orderNumber));
  console.log(`Existing Amazon orders in DB: ${existingOrderNumbers.size}`);

  // Step 4: Group CSV records by Order ID
  const orderMap = new Map<string, any[]>();
  for (const row of records) {
    const orderId = (row['Order ID'] || '').trim();
    if (!orderId) continue;
    if (!orderMap.has(orderId)) orderMap.set(orderId, []);
    orderMap.get(orderId)!.push(row);
  }
  console.log(`Unique orders in CSV: ${orderMap.size}`);

  // Step 5: Filter to only new orders
  const newOrders = [...orderMap.entries()].filter(([id]) => !existingOrderNumbers.has(id));
  console.log(`New orders to import: ${newOrders.length}`);

  if (newOrders.length === 0) {
    console.log('\nNo new orders to import. All done!');
    process.exit(0);
  }

  // Step 6: Create bank accounts for payment methods
  // Parse payment methods from the CSV to identify unique cards
  const paymentCards = new Map<string, { network: string; last4: string; count: number }>();
  for (const row of records) {
    const pm = (row['Payment Method Type'] || '').trim();
    if (!pm || pm === 'Not Available' || pm === 'Gift Certificate/Card') continue;
    // Extract primary payment method (before " and Gift Certificate/Card")
    const primary = pm.split(' and ')[0].trim();
    if (primary === 'Gift Certificate/Card') continue;
    const match = primary.match(/^(Visa|MasterCard|AmericanExpress|AmazonPLCC|Bank Account)\s*-\s*(\d+)$/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      if (!paymentCards.has(key)) {
        paymentCards.set(key, { network: match[1], last4: match[2], count: 0 });
      }
      paymentCards.get(key)!.count++;
    }
  }

  // Check which cards already exist as bank accounts
  const existingLast4s = new Set(existingAccounts.map(a => a.lastFourDigits));
  const newCards = [...paymentCards.entries()].filter(([_, card]) => !existingLast4s.has(card.last4));
  
  console.log(`\n=== PAYMENT CARDS TO CREATE (${newCards.length} new) ===`);
  for (const [key, card] of newCards) {
    console.log(`  ${key}: ${card.network} ending ${card.last4} (${card.count} orders)`);
  }

  // Create new bank accounts for cards with significant usage (5+ orders)
  const significantCards = newCards.filter(([_, card]) => card.count >= 5);
  console.log(`\nCreating ${significantCards.length} bank accounts for cards with 5+ orders...`);
  
  for (const [key, card] of significantCards) {
    const networkName = card.network === 'AmericanExpress' ? 'American Express' : 
                        card.network === 'AmazonPLCC' ? 'Amazon Store Card' :
                        card.network === 'Bank Account' ? 'Bank Account' : card.network;
    const institution = card.network === 'AmericanExpress' ? 'American Express' :
                        card.network === 'AmazonPLCC' ? 'Synchrony Bank' :
                        card.network === 'Bank Account' ? 'Unknown Bank' : 'Unknown Bank';
    const accountType = card.network === 'Bank Account' ? 'checking' as const : 'credit_card' as const;
    
    await db.insert(bankAccounts).values({
      userId: USER_ID,
      institution,
      accountName: `${networkName} ****${card.last4}`,
      accountType,
      category: 'personal',
      currency: 'USD',
      lastFourDigits: card.last4,
      isActive: true,
    });
    console.log(`  Created: ${networkName} ****${card.last4}`);
  }

  // Step 7: Import new orders
  console.log(`\n=== IMPORTING ${newOrders.length} NEW ORDERS ===`);
  let imported = 0;
  let itemsImported = 0;

  for (const [orderId, items] of newOrders) {
    const firstItem = items[0];
    const orderDate = firstItem['Order Date'] ? new Date(firstItem['Order Date']) : new Date();
    const shipDate = firstItem['Ship Date'] ? new Date(firstItem['Ship Date']) : null;
    
    // Calculate order total from items
    const totalAmount = items.reduce((sum: number, item: any) => {
      const amt = parseFloat(item['Total Amount'] || '0');
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    const taxAmount = items.reduce((sum: number, item: any) => {
      const amt = parseFloat(item['Shipment Item Subtotal Tax'] || '0');
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    const shippingCharge = items.reduce((sum: number, item: any) => {
      const amt = parseFloat(item['Shipping Charge'] || '0');
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    const discountAmount = items.reduce((sum: number, item: any) => {
      const amt = parseFloat(item['Total Discounts'] || '0');
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
    const subtotal = items.reduce((sum: number, item: any) => {
      const amt = parseFloat(item['Shipment Item Subtotal'] || '0');
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    // Extract payment info
    const paymentMethodRaw = (firstItem['Payment Method Type'] || '').trim();
    const primaryPayment = paymentMethodRaw.split(' and ')[0].trim();
    const pmMatch = primaryPayment.match(/^(Visa|MasterCard|AmericanExpress|AmazonPLCC|Bank Account)\s*-\s*(\d+)$/);
    const paymentCardLast4 = pmMatch ? pmMatch[2] : null;

    // Extract shipping address
    const shippingAddress = (firstItem['Shipping Address'] || '').trim();
    
    // Extract tracking
    const trackingNumbers = items
      .map((item: any) => (item['Carrier Name & Tracking Number'] || '').trim())
      .filter((t: string) => t && t !== 'Not Available')
      .join(', ');

    // Determine status
    const statuses = items.map((item: any) => (item['Order Status'] || '').trim());
    const status = statuses.includes('Cancelled') ? 'cancelled' :
                   statuses.every((s: string) => s === 'Delivered' || s === 'Closed') ? 'delivered' :
                   statuses.some((s: string) => s === 'Shipped') ? 'shipped' : 'pending';

    // Insert order
    const newId = randomUUID().replace(/-/g, '').slice(0, 21);
    await db.execute(sql`INSERT INTO vendor_orders 
      (id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo, 
       subtotal, taxAmount, shippingAmount, totalAmount, discountAmount, currency_vo,
       orderDate, deliveryDate, trackingNumbers, deliveryAddress, paymentMethod, paymentCardLast4,
       importSource_vo, createdAt_vo, updatedAt_vo)
      VALUES (${newId}, ${HOUSEHOLD_ID}, ${AMAZON_VENDOR_ACCOUNT_ID}, ${orderId}, 
              'amazon', ${status},
              ${subtotal.toFixed(2)}, ${taxAmount.toFixed(2)}, ${shippingCharge.toFixed(2)}, 
              ${totalAmount.toFixed(2)}, ${discountAmount.toFixed(2)}, 'USD',
              ${orderDate.getTime()}, ${shipDate ? shipDate.getTime() : null},
              ${trackingNumbers || null}, ${shippingAddress || null},
              ${paymentMethodRaw || null}, ${paymentCardLast4},
              'csv_import', NOW(), NOW())`);

    // Insert order items
    for (const item of items) {
      const itemId = randomUUID().replace(/-/g, '').slice(0, 21);
      const productName = (item['Product Name'] || '').trim();
      const asin = (item['ASIN'] || '').trim();
      const unitPrice = parseFloat(item['Unit Price'] || '0') || 0;
      const quantity = parseInt(item['Original Quantity'] || '1') || 1;
      const itemSubtotal = parseFloat(item['Shipment Item Subtotal'] || '0') || 0;
      const itemTax = parseFloat(item['Shipment Item Subtotal Tax'] || '0') || 0;

      await db.execute(sql`INSERT INTO vendor_order_items
        (id, vendorOrderId, productName, externalProductId, quantity, unitPrice, totalPrice, taxAmount, createdAt)
        VALUES (${itemId}, ${newId}, ${productName}, ${asin || null}, 
                ${quantity}, ${unitPrice.toFixed(2)}, ${itemSubtotal.toFixed(2)}, ${itemTax.toFixed(2)}, NOW())`);
      itemsImported++;
    }

    imported++;
    if (imported % 50 === 0) {
      console.log(`  Imported ${imported}/${newOrders.length} orders (${itemsImported} items)...`);
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`  Orders imported: ${imported}`);
  console.log(`  Items imported: ${itemsImported}`);
  console.log(`  Bank accounts created: ${significantCards.length}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
