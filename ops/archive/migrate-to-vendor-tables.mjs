/**
 * Section 16 Migration: Steps 3-4
 * Migrates:
 *   - orders (61 rows) → vendor_orders
 *   - walmart_orders (185 rows) → vendor_orders
 *   - order_items (419 rows) → vendor_order_items
 *
 * Prerequisites:
 *   - vendor_accounts must have seed data (at least amazon, walmart)
 *   - vendor_orders and vendor_order_items tables must exist
 *
 * This script:
 *   1. Seeds vendor_accounts for the household
 *   2. Migrates orders → vendor_orders (with legacyOrderId backlink)
 *   3. Migrates walmart_orders → vendor_orders (with legacyWalmartOrderId backlink)
 *   4. Migrates order_items → vendor_order_items (with legacyOrderItemId backlink)
 *   5. Writes audit log entries for the migration
 */
import mysql from 'mysql2/promise';
import { randomBytes } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';

function nanoid(size = 21) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) id += alphabet[bytes[i] % 64];
  return id;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const now = Date.now();

  // ─── Step 1: Seed Vendor Accounts ──────────────────────────────────
  console.log('=== Seeding Vendor Accounts ===');
  const vendorSeeds = [
    { slug: 'amazon', name: 'Amazon', platform: 'amazon', patterns: ['AMZN', 'AMAZON', 'AMZ*'] },
    { slug: 'walmart', name: 'Walmart', platform: 'walmart', patterns: ['WAL-MART', 'WALMART', 'WM SUPERCENTER'] },
    { slug: 'uber', name: 'Uber', platform: 'uber', patterns: ['UBER', 'UBER EATS', 'UBER*'] },
    { slug: 'google', name: 'Google', platform: 'google', patterns: ['GOOGLE*', 'GOOGLE CLOUD'] },
    { slug: 'apple', name: 'Apple', platform: 'apple', patterns: ['APPLE.COM', 'APPLE STORE'] },
    { slug: 'paypal', name: 'PayPal', platform: 'paypal', patterns: ['PAYPAL*', 'PP*'] },
    { slug: 'lowes', name: "Lowe's", platform: 'lowes', patterns: ["LOWE'S", 'LOWES'] },
    { slug: 'target', name: 'Target', platform: 'target', patterns: ['TARGET', 'TARGET.COM'] },
    { slug: 'home_depot', name: 'Home Depot', platform: 'home_depot', patterns: ['HOME DEPOT', 'HOMEDEPOT'] },
    { slug: 'shopify', name: 'Shopify', platform: 'shopify', patterns: ['SHOPIFY*'] },
    { slug: 'wayfair', name: 'Wayfair', platform: 'wayfair', patterns: ['WAYFAIR'] },
    { slug: 'costco', name: 'Costco', platform: 'costco', patterns: ['COSTCO'] },
    { slug: 'instacart', name: 'Instacart', platform: 'instacart', patterns: ['INSTACART'] },
    { slug: 'doordash', name: 'DoorDash', platform: 'doordash', patterns: ['DOORDASH'] },
  ];

  const vendorAccountMap = {}; // slug → id
  for (const v of vendorSeeds) {
    const id = nanoid();
    try {
      await conn.query(
        `INSERT INTO vendor_accounts (id, householdId, vendorName, vendorSlug, platform, bankStatementPatterns, isActive, createdAt_va, updatedAt_va)
         VALUES (?, ?, ?, ?, ?, ?, true, ?, ?)`,
        [id, HOUSEHOLD_ID, v.name, v.slug, v.platform, JSON.stringify(v.patterns), now, now]
      );
      vendorAccountMap[v.slug] = id;
      console.log(`  Created vendor: ${v.name} (${id})`);
    } catch (e) {
      if (e.errno === 1062) {
        // Already exists — fetch existing ID
        const [rows] = await conn.query(
          'SELECT id FROM vendor_accounts WHERE householdId = ? AND vendorSlug = ?',
          [HOUSEHOLD_ID, v.slug]
        );
        if (rows.length) vendorAccountMap[v.slug] = rows[0].id;
        console.log(`  Exists: ${v.name} (${vendorAccountMap[v.slug]})`);
      } else throw e;
    }
  }

  // ─── Step 2: Migrate orders → vendor_orders ────────────────────────
  console.log('\n=== Migrating orders → vendor_orders ===');
  const [orders] = await conn.query('SELECT * FROM orders');
  console.log(`  Found ${orders.length} orders to migrate`);

  let ordersMigrated = 0;
  const legacyToVendorOrderMap = {}; // legacyOrderId → vendorOrderId

  for (const o of orders) {
    // Map platform to vendor slug
    const platformLower = (o.platform || 'other').toLowerCase();
    let vendorSlug = platformLower;
    if (platformLower.includes('amazon')) vendorSlug = 'amazon';
    else if (platformLower.includes('walmart')) vendorSlug = 'walmart';
    else if (platformLower.includes('wayfair')) vendorSlug = 'wayfair';
    else if (platformLower.includes('home depot') || platformLower.includes('homedepot')) vendorSlug = 'home_depot';
    else if (platformLower.includes('lowe')) vendorSlug = 'lowes';
    else if (platformLower.includes('target')) vendorSlug = 'target';

    let vendorAccountId = vendorAccountMap[vendorSlug];
    if (!vendorAccountId) {
      // Create an "other" vendor account for unknown platforms
      if (!vendorAccountMap['other_' + vendorSlug]) {
        const otherId = nanoid();
        await conn.query(
          `INSERT INTO vendor_accounts (id, householdId, vendorName, vendorSlug, platform, isActive, createdAt_va, updatedAt_va)
           VALUES (?, ?, ?, ?, 'other', true, ?, ?)`,
          [otherId, HOUSEHOLD_ID, o.platform || 'Unknown', 'other_' + vendorSlug, now, now]
        );
        vendorAccountMap['other_' + vendorSlug] = otherId;
      }
      vendorAccountId = vendorAccountMap['other_' + vendorSlug];
    }

    // Map platform to enum value
    const platformEnum = ['amazon', 'walmart', 'uber', 'google', 'apple', 'paypal',
      'lowes', 'target', 'home_depot', 'shopify', 'wayfair', 'costco',
      'sams_club', 'instacart', 'doordash', 'grubhub', 'other'];
    const platformVal = platformEnum.includes(vendorSlug) ? vendorSlug : 'other';

    // Map status
    const statusMap = { pending: 'pending', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', returned: 'returned' };
    const status = statusMap[o.status] || 'pending';

    // Map import source
    const importMap = { email: 'email_scrape', manual: 'manual', whatsapp: 'whatsapp' };
    const importSource = importMap[o.importSource] || 'manual';

    const voId = nanoid();
    const orderDateMs = o.orderDate ? new Date(o.orderDate).getTime() : now;
    const deliveryDateMs = o.deliveryDate ? new Date(o.deliveryDate).getTime() : null;

    await conn.query(
      `INSERT INTO vendor_orders (id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo, totalAmount, currency_vo, orderDate, deliveryDate, trackingNumbers, importSource_vo, legacyOrderId, createdAt_vo, updatedAt_vo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [voId, HOUSEHOLD_ID, vendorAccountId, o.orderNumber, platformVal, status,
       o.totalAmount, o.currency || 'USD', orderDateMs, deliveryDateMs,
       o.trackingNumber ? JSON.stringify([o.trackingNumber]) : null,
       importSource, o.id, now, now]
    );
    legacyToVendorOrderMap[o.id] = voId;
    ordersMigrated++;
  }
  console.log(`  Migrated ${ordersMigrated} orders`);

  // ─── Step 3: Migrate walmart_orders → vendor_orders ────────────────
  console.log('\n=== Migrating walmart_orders → vendor_orders ===');
  const [walmartOrders] = await conn.query('SELECT * FROM walmart_orders');
  console.log(`  Found ${walmartOrders.length} walmart_orders to migrate`);

  let walmartMigrated = 0;
  const walmartVendorAccountId = vendorAccountMap['walmart'];

  for (const wo of walmartOrders) {
    const voId = nanoid();
    const orderDateMs = wo.orderDate ? new Date(wo.orderDate).getTime() : now;
    const deliveryDateMs = wo.deliveryDate ? new Date(wo.deliveryDate).getTime() : null;

    await conn.query(
      `INSERT INTO vendor_orders (id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo, totalAmount, currency_vo, orderDate, deliveryDate, importSource_vo, legacyWalmartOrderId, createdAt_vo, updatedAt_vo)
       VALUES (?, ?, ?, ?, 'walmart', ?, ?, 'USD', ?, ?, 'email_scrape', ?, ?, ?)`,
      [voId, HOUSEHOLD_ID, walmartVendorAccountId, wo.orderNumber,
       wo.status || 'delivered', wo.totalAmount, orderDateMs, deliveryDateMs,
       wo.id, now, now]
    );
    walmartMigrated++;
  }
  console.log(`  Migrated ${walmartMigrated} walmart_orders`);

  // ─── Step 4: Migrate order_items → vendor_order_items ──────────────
  console.log('\n=== Migrating order_items → vendor_order_items ===');
  const [items] = await conn.query('SELECT * FROM order_items');
  console.log(`  Found ${items.length} order_items to migrate`);

  let itemsMigrated = 0;
  let itemsSkipped = 0;

  for (const item of items) {
    const vendorOrderId = legacyToVendorOrderMap[item.orderId];
    if (!vendorOrderId) {
      itemsSkipped++;
      continue;
    }

    const voiId = nanoid();
    // Map propertyAttribution enum to verticalId
    // artistes_boutique, morabeza, sunset_studio → Bohemian Lodges vertical
    // personal → personal vertical
    const bohemianVerticalId = 'c3pW-Cxhm9WAQZ17pTMb3';
    const personalVerticalId = 'tjpfam-vert-self';
    let verticalId = null;
    if (['artistes_boutique', 'morabeza', 'sunset_studio'].includes(item.propertyAttribution)) {
      verticalId = bohemianVerticalId;
    } else if (item.propertyAttribution === 'personal') {
      verticalId = personalVerticalId;
    }

    await conn.query(
      `INSERT INTO vendor_order_items (id, vendorOrderId, householdId, name, quantity, unitPrice, lineTotal, currency_voi, vendorProductId, asin, productUrl, chartOfAccountId, verticalId_voi, propertyId_voi, isTaxDeductible_voi, taxCategory, aiConfidence_voi, isManualOverride_voi, deliveryAddress_voi, tags_voi, legacyOrderItemId, createdAt_voi, updatedAt_voi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [voiId, vendorOrderId, HOUSEHOLD_ID, item.name, item.quantity,
       item.unitPrice, item.lineTotal, item.currency || 'USD',
       item.vendorProductId, item.asin, item.productUrl,
       verticalId, item.isTaxDeductible ? 1 : 0, item.expenseCategory,
       item.aiConfidence, item.isManualOverride ? 1 : 0,
       item.deliveryAddress, item.tags ? JSON.stringify(item.tags) : null,
       item.id, now, now]
    );
    itemsMigrated++;
  }
  console.log(`  Migrated ${itemsMigrated} items, skipped ${itemsSkipped} (no matching vendor_order)`);

  // ─── Step 5: Write Audit Log ───────────────────────────────────────
  console.log('\n=== Writing Audit Log ===');
  await conn.query(
    `INSERT INTO audit_log (actorType, householdId, action, category, resourceType, outcome, metadata, previousValue, newValue, createdAt)
     VALUES ('system', ?, 'data_migration', 'shopping', 'vendor_orders', 'success', ?, NULL, ?, NOW())`,
    [HOUSEHOLD_ID,
     JSON.stringify({ step: 'S16-Steps-3-4', ordersCount: ordersMigrated, walmartCount: walmartMigrated, itemsCount: itemsMigrated }),
     JSON.stringify({ vendorOrders: ordersMigrated + walmartMigrated, vendorOrderItems: itemsMigrated })]
  );
  console.log('  Audit log entry written');

  // ─── Summary ───────────────────────────────────────────────────────
  console.log('\n=== Migration Complete ===');
  console.log(`  Vendor accounts seeded: ${Object.keys(vendorAccountMap).length}`);
  console.log(`  orders → vendor_orders: ${ordersMigrated}`);
  console.log(`  walmart_orders → vendor_orders: ${walmartMigrated}`);
  console.log(`  order_items → vendor_order_items: ${itemsMigrated} (${itemsSkipped} skipped)`);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
