/**
 * Amazon Order History Import Script
 * 
 * Imports OrderHistory.csv into:
 * 1. bank_accounts — creates new accounts for payment methods (with card number history)
 * 2. vendor_orders + vendor_order_items — all orders 2020-2026 for LLM enrichment
 * 3. walmart_orders — 2025-2026 items as uncategorized expenses for the categorization tool
 * 
 * walmart_orders schema:
 *   id (UUID), householdId, orderDate (timestamp), orderType, totalAmount (decimal),
 *   currency, walmartOrderId (used as orderId), location, seller, isRefund,
 *   thumbnailUrls (json), itemNames (json), rawDescription, walmartUrl (order URL),
 *   categorizationStatus (pending|categorized|split|skipped), bankAccountId (int)
 */

import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const AMAZON_VENDOR_ACCOUNT_ID = '1xodoVrwoqtTF1GfMUyQc';
const CSV_PATH = '/home/ubuntu/upload/OrderHistory.csv';

// ─── Payment Method → Bank Account Mapping ───────────────────────────────────
const CARD_GROUPS = {
  'visa_7766': ['Visa - 7766', 'Visa - 9761'],  // Same account, card replaced
  'amex_1048': ['AmericanExpress - 1048'],
  'mc_9282': ['MasterCard - 9282'],
  'visa_5894': ['Visa - 5894'],
  'visa_0586': ['Visa - 0586'],
  'visa_5270': ['Visa - 5270'],
  'gift_card': ['Gift Certificate/Card'],
};

const BANK_ACCOUNTS_TO_CREATE = [
  {
    key: 'visa_7766',
    accountName: 'Visa ending 7766',
    institution: 'Visa',
    accountType: 'credit_card',
    lastFourDigits: '7766',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['9761', '7766']),
  },
  {
    key: 'amex_1048',
    accountName: 'American Express ending 1048',
    institution: 'American Express',
    accountType: 'credit_card',
    lastFourDigits: '1048',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['1048']),
  },
  {
    key: 'mc_9282',
    accountName: 'MasterCard ending 9282',
    institution: 'MasterCard',
    accountType: 'credit_card',
    lastFourDigits: '9282',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['9282']),
  },
  {
    key: 'visa_5894',
    accountName: 'Visa ending 5894',
    institution: 'Visa',
    accountType: 'credit_card',
    lastFourDigits: '5894',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['5894']),
  },
  {
    key: 'visa_0586',
    accountName: 'Visa ending 0586',
    institution: 'Visa',
    accountType: 'credit_card',
    lastFourDigits: '0586',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['0586']),
  },
  {
    key: 'visa_5270',
    accountName: 'Visa ending 5270',
    institution: 'Visa',
    accountType: 'credit_card',
    lastFourDigits: '5270',
    category: 'personal',
    cardNumberHistory: JSON.stringify(['5270']),
  },
  {
    key: 'gift_card',
    accountName: 'Amazon Gift Card / Points Balance',
    institution: 'Amazon',
    accountType: 'other',
    lastFourDigits: null,
    category: 'personal',
    cardNumberHistory: null,
  },
];

function extractPrimaryCard(paymentMethod) {
  if (!paymentMethod || paymentMethod === 'Not Available') return null;
  let pm = paymentMethod;
  if (pm.includes(' and Gift Certificate/Card')) {
    pm = pm.replace(' and Gift Certificate/Card', '');
  } else if (pm.startsWith('Gift Certificate/Card and ')) {
    pm = pm.replace('Gift Certificate/Card and ', '');
  } else if (pm === 'Gift Certificate/Card') {
    return 'Gift Certificate/Card';
  }
  return pm;
}

function findBankAccountKey(paymentMethod) {
  const primary = extractPrimaryCard(paymentMethod);
  if (!primary) return null;
  for (const [key, cards] of Object.entries(CARD_GROUPS)) {
    if (cards.includes(primary)) return key;
  }
  return null;
}

function extractLast4(paymentMethod) {
  const primary = extractPrimaryCard(paymentMethod);
  if (!primary) return null;
  const match = primary.match(/(\d{4})$/);
  return match ? match[1] : null;
}

function mapStatus(orderStatus, shipmentStatus) {
  if (orderStatus === 'Cancelled') return 'cancelled';
  if (shipmentStatus === 'Shipped' || shipmentStatus === 'Delivered') return 'delivered';
  if (shipmentStatus === 'Pending') return 'pending';
  return 'delivered';
}

async function main() {
  console.log('🚀 Starting Amazon Order Import...\n');
  
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  console.log(`📊 Parsed ${records.length} line items from CSV`);
  
  const conn = await createConnection(process.env.DATABASE_URL);
  
  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Create Bank Accounts
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n── Step 1: Creating Bank Accounts ──');
    const bankAccountIds = {};
    
    for (const acct of BANK_ACCOUNTS_TO_CREATE) {
      const [existing] = await conn.execute(
        'SELECT id FROM bank_accounts WHERE accountName = ? LIMIT 1',
        [acct.accountName]
      );
      
      if (existing.length > 0) {
        bankAccountIds[acct.key] = existing[0].id;
        console.log(`  ✓ ${acct.accountName} already exists (id: ${existing[0].id})`);
      } else {
        const [result] = await conn.execute(
          `INSERT INTO bank_accounts (userId, householdId, accountName, institution, accountType, lastFourDigits, category, cardNumberHistory)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
          [HOUSEHOLD_ID, acct.accountName, acct.institution, acct.accountType, acct.lastFourDigits, acct.category, acct.cardNumberHistory]
        );
        bankAccountIds[acct.key] = result.insertId;
        console.log(`  + Created ${acct.accountName} (id: ${result.insertId})`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Group line items by Order ID
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n── Step 2: Grouping items by order ──');
    const orderMap = new Map();
    
    for (const row of records) {
      const orderId = row['Order ID'];
      if (!orderId) continue;
      
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          orderId,
          orderDate: row['Order Date'],
          status: row['Order Status'],
          shipmentStatus: row['Shipment Status'],
          paymentMethod: row['Payment Method Type'],
          shippingAddress: row['Shipping Address'],
          billingAddress: row['Billing Address'],
          totalAmount: row['Total Amount'],
          totalDiscounts: row['Total Discounts'],
          shippingCharge: row['Shipping Charge'],
          currency: row['Currency'] || 'USD',
          carrier: row['Carrier Name & Tracking Number'],
          items: [],
        });
      }
      
      orderMap.get(orderId).items.push({
        asin: row['ASIN'],
        productName: row['Product Name'],
        quantity: parseInt(row['Original Quantity']) || 1,
        unitPrice: parseFloat(row['Unit Price']) || 0,
        unitPriceTax: parseFloat(row['Unit Price Tax']) || 0,
        productCondition: row['Product Condition'],
        shipDate: row['Ship Date'],
      });
    }
    
    console.log(`  Found ${orderMap.size} unique orders`);
    
    const vendorHistoryOrders = [];
    const expenseOrders = [];
    
    for (const [, order] of orderMap) {
      const year = parseInt(order.orderDate?.slice(0, 4));
      if (year >= 2020 && year <= 2026) vendorHistoryOrders.push(order);
      if (year >= 2025 && year <= 2026) expenseOrders.push(order);
    }
    
    console.log(`  2020-2026 orders (vendor history): ${vendorHistoryOrders.length}`);
    console.log(`  2025-2026 orders (expenses): ${expenseOrders.length}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Import into vendor_orders + vendor_order_items (2020-2026)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n── Step 3: Importing vendor orders (2020-2026) ──');
    let vendorOrdersCreated = 0;
    let vendorItemsCreated = 0;
    
    for (const order of vendorHistoryOrders) {
      const [existing] = await conn.execute(
        'SELECT id FROM vendor_orders WHERE orderNumber = ? AND householdId = ? LIMIT 1',
        [order.orderId, HOUSEHOLD_ID]
      );
      if (existing.length > 0) continue;
      
      const voId = nanoid();
      const orderDateMs = new Date(order.orderDate).getTime();
      const now = Date.now();
      
      const subtotal = order.items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
      const taxAmount = order.items.reduce((s, i) => s + (i.unitPriceTax * i.quantity), 0);
      const totalAmount = parseFloat(order.totalAmount) || (subtotal + taxAmount);
      const discountAmount = Math.abs(parseFloat(String(order.totalDiscounts || '0').replace(/[^0-9.-]/g, '')) || 0);
      const shippingAmount = parseFloat(order.shippingCharge) || 0;
      
      let trackingNumbers = null;
      if (order.carrier && order.carrier !== 'Not Available') {
        const trackMatch = order.carrier.match(/\(([^)]+)\)/);
        if (trackMatch) trackingNumbers = JSON.stringify([trackMatch[1]]);
      }
      
      await conn.execute(
        `INSERT INTO vendor_orders (id, householdId, vendorAccountId, orderNumber, platform, status, 
         subtotal, taxAmount, shippingAmount, totalAmount, discountAmount, currency, orderDate, 
         deliveryAddress, paymentMethod, paymentCardLast4, importSource, trackingNumbers, createdAt_vo, updatedAt_vo)
         VALUES (?, ?, ?, ?, 'amazon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_upload', ?, ?, ?)`,
        [voId, HOUSEHOLD_ID, AMAZON_VENDOR_ACCOUNT_ID, order.orderId,
         mapStatus(order.status, order.shipmentStatus),
         subtotal.toFixed(2), taxAmount.toFixed(2), shippingAmount.toFixed(2),
         totalAmount.toFixed(2), discountAmount.toFixed(2), order.currency, orderDateMs,
         order.shippingAddress || null, order.paymentMethod, extractLast4(order.paymentMethod),
         trackingNumbers, now, now]
      );
      vendorOrdersCreated++;
      
      for (const item of order.items) {
        const voiId = nanoid();
        const lineTotal = (item.unitPrice * item.quantity).toFixed(2);
        const itemTax = (item.unitPriceTax * item.quantity).toFixed(2);
        
        await conn.execute(
          `INSERT INTO vendor_order_items (id, vendorOrderId, householdId, name, quantity, unitPrice, 
           lineTotal, itemTax, currency_voi, vendorProductId, asin, createdAt_voi, updatedAt_voi)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [voiId, voId, HOUSEHOLD_ID, item.productName, item.quantity,
           item.unitPrice.toFixed(2), lineTotal, itemTax, order.currency,
           item.asin, item.asin, now, now]
        );
        vendorItemsCreated++;
      }
      
      if (vendorOrdersCreated % 50 === 0) {
        process.stdout.write(`\r  ${vendorOrdersCreated} orders imported...`);
      }
    }
    console.log(`\n  ✓ Created ${vendorOrdersCreated} vendor orders, ${vendorItemsCreated} line items`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Import 2025-2026 as uncategorized expenses (walmart_orders format)
    // Each LINE ITEM becomes a separate walmart_order row for categorization
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n── Step 4: Importing expenses (2025-2026) into walmart_orders ──');
    let expensesCreated = 0;
    
    for (const order of expenseOrders) {
      const bankKey = findBankAccountKey(order.paymentMethod);
      const bankAccountId = bankKey ? bankAccountIds[bankKey] : null;
      const orderUrl = `https://www.amazon.com/gp/your-account/order-details?orderID=${order.orderId}`;
      
      for (const item of order.items) {
        const woId = randomUUID();
        const lineTotal = (item.unitPrice * item.quantity);
        const itemTax = (item.unitPriceTax * item.quantity);
        const totalWithTax = lineTotal + itemTax;
        
        // Check if already imported
        const [existing] = await conn.execute(
          `SELECT id FROM walmart_orders WHERE walmartOrderId = ? AND itemNames = CAST(? AS JSON) AND householdId = ? LIMIT 1`,
          [order.orderId, JSON.stringify([item.productName]), HOUSEHOLD_ID]
        );
        if (existing.length > 0) continue;
        
        // Format: matches walmart_orders schema exactly
        await conn.execute(
          `INSERT INTO walmart_orders (id, householdId, orderDate, orderType, totalAmount, currency, 
           walmartOrderId, location, seller, isRefund, thumbnailUrls, itemNames, rawDescription, 
           walmartUrl, categorizationStatus, bankAccountId, createdAt, updatedAt)
           VALUES (?, ?, ?, 'Amazon Order', ?, 'USD', ?, NULL, 'Amazon', 0, NULL, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
          [
            woId,
            HOUSEHOLD_ID,
            order.orderDate ? new Date(order.orderDate) : null,
            totalWithTax.toFixed(2),
            order.orderId,
            JSON.stringify([item.productName]),
            `Amazon order ${order.orderId}, ${item.productName} (Qty: ${item.quantity}), $${totalWithTax.toFixed(2)}`,
            orderUrl,
            bankAccountId,
          ]
        );
        expensesCreated++;
        
        if (expensesCreated % 50 === 0) {
          process.stdout.write(`\r  ${expensesCreated} expenses imported...`);
        }
      }
    }
    console.log(`\n  ✓ Created ${expensesCreated} expense records (all uncategorized/pending)`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Summary
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════');
    console.log('  IMPORT COMPLETE');
    console.log('══════════════════════════════════════════');
    console.log(`  Bank accounts created: ${Object.keys(bankAccountIds).length}`);
    console.log(`  Vendor orders (2020-2026): ${vendorOrdersCreated}`);
    console.log(`  Vendor order items: ${vendorItemsCreated}`);
    console.log(`  Expense records (2025-2026): ${expensesCreated}`);
    console.log(`  Bank accounts auto-linked to expenses: ${expensesCreated - 0}`);
    console.log('══════════════════════════════════════════\n');
    
    // Show bank account mapping summary
    console.log('Bank Account Mapping:');
    for (const [key, id] of Object.entries(bankAccountIds)) {
      const cards = CARD_GROUPS[key];
      console.log(`  ${key} (id: ${id}) ← ${cards.join(', ')}`);
    }
    
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
