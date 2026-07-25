/**
 * Migrate walmart_orders → vendor_orders/vendor_order_items
 * Migrate walmart_order_categorizations → expenses
 * 
 * Strategy:
 * 1. For each walmart_order, check if a matching vendor_order already exists (by orderNumber/walmartOrderId)
 * 2. If not, create a new vendor_order + vendor_order_item
 * 3. For each walmart_order_categorization, create an expenses row linking to the COA
 * 
 * The walmart_orders table has 185 rows. Many of these already have matching vendor_orders
 * (from email scraping). We link them rather than duplicate.
 */

import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const WALMART_VENDOR_ACCOUNT_ID = 'GEF7Vzw1_jDc1lmsRKfNS';

function nanoid(size = 21) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  const bytes = randomBytes(size);
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

// Legacy category → COA account number mapping
const LEGACY_CATEGORY_MAP = {
  'Home: Mortgage/Rent': 'HF-5010',
  'Home: Property Tax': 'HF-5020',
  'Home: Home Insurance': 'HF-5030',
  'Home: Maintenance & Repairs': 'HF-5040',
  'Home: Utilities': 'HF-5050',
  'Home: Furnishings': 'HF-5060',
  'Home: Groceries': 'HF-5070',
  'Home: Childcare & Education': 'HF-5080',
  'Home: Family Activities': 'HF-5090',
  'Home: Pet Care': 'HF-5100',
  'Home: Auto Maintenance & Repair': 'HF-5110',
  'Home: Credit Card Interest Charges': 'HF-5120',
  'Home: Bank Fees': 'HF-5130',
  'Home: Traveling/Mileage Expense': 'HF-5140',
  'Home: Miscellaneous': 'HF-5190',
  'Market: Cleaning Expense (Rental Property)': 'MM-5020',
  'Market: Cost of Goods Sold': 'MM-5010',
  'Market: Repairs & Maintenance': 'MM-5030',
  'Market: Repairs & Maintenance:Repairs & Maintenance - Cleaning': 'MM-5031',
  'Market: Repairs & Maintenance:Repairs & Maintenance - Labor': 'MM-5032',
  'Market: Advertising & Marketing': 'MM-5040',
  'Market: Job Supplies': 'MM-5050',
  'Market: Insurance': 'MM-5060',
  'Market: Utilities': 'MM-5070',
  'Market: Contractors': 'MM-5080',
  'Market: Freight Costs': 'MM-5090',
  'Market: Legal & Professional Services': 'MM-5100',
  'Bohemian: Cleaning Expense (Rental Property)': 'BL-5010',
  'Bohemian: Repairs & Maintenance': 'BL-5020',
  'Bohemian: Repairs & Maintenance:Repairs & Maintenance - Cleaning': 'BL-5021',
  'Bohemian: Repairs & Maintenance:Repairs & Maintenance - Labor': 'BL-5022',
  'Bohemian: Advertising & Marketing': 'BL-5030',
  'Bohemian: Job Supplies': 'BL-5040',
  'Bohemian: Insurance': 'BL-5050',
  'Bohemian: Interest Paid:Mortgage Interest Paid': 'BL-5060',
  'Bohemian: Taxes & Licenses': 'BL-5070',
  'Bohemian: Travel': 'BL-5080',
  'Bohemian: Utilities': 'BL-5090',
  'Bohemian: Contractors': 'BL-5100',
  'Bohemian: Freight Costs': 'BL-5110',
  'Bohemian: Auto Maintenance & Repair': 'BL-5120',
  'Bohemian: Credit Card Interest Charges': 'BL-5130',
  'Bohemian: Bank Fees': 'BL-5140',
  'Bohemian: Traveling/Mileage Expense': 'BL-5150',
};

// Vertical name → actual vertical ID mapping
const VERTICAL_NAME_TO_ID = {
  'Home & Family': 'tjpfam-vert-home',
  'Maxfield Bakery': 'tjpfam-vert-bakery',
  'Maxfield Market': 'tjpfam-vert-market',
  'Personal': 'tjpfam-vert-self',
  'StartOut': 'tjpfam-vert-startout',
  'Bohemian Lodges': 'c3pW-Cxhm9WAQZ17pTMb3',
};

async function main() {
  console.log('🔄 Migrating Walmart data to proper schema...\n');
  
  const conn = await createConnection(process.env.DATABASE_URL);
  const now = Date.now();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Build COA lookup (accountNumber → id)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── Step 1: Building COA lookup ──');
  const [coaRows] = await conn.execute(
    'SELECT id, accountNumber FROM chart_of_accounts WHERE householdId = ?',
    [HOUSEHOLD_ID]
  );
  const coaLookup = {};
  for (const row of coaRows) {
    coaLookup[row.accountNumber] = row.id;
  }
  console.log(`  Loaded ${Object.keys(coaLookup).length} COA entries`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Get all walmart_orders
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n── Step 2: Loading walmart_orders ──');
  const [walmartOrders] = await conn.execute(
    'SELECT * FROM walmart_orders WHERE householdId = ?',
    [HOUSEHOLD_ID]
  );
  console.log(`  Found ${walmartOrders.length} walmart_orders`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: For each walmart_order, find or create a vendor_order
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n── Step 3: Linking/creating vendor_orders ──');
  let linked = 0;
  let created = 0;
  const woToVoMap = {}; // walmart_order.id → vendor_order.id
  
  for (const wo of walmartOrders) {
    // Try to find existing vendor_order by orderNumber matching walmartOrderId
    let vendorOrderId = null;
    
    if (wo.walmartOrderId) {
      const [existing] = await conn.execute(
        'SELECT id FROM vendor_orders WHERE orderNumber = ? AND householdId = ? LIMIT 1',
        [wo.walmartOrderId, HOUSEHOLD_ID]
      );
      if (existing.length > 0) {
        vendorOrderId = existing[0].id;
        linked++;
      }
    }
    
    if (!vendorOrderId) {
      // Also try matching by legacy ID
      const [byLegacy] = await conn.execute(
        'SELECT id FROM vendor_orders WHERE legacyWalmartOrderId = ? AND householdId = ? LIMIT 1',
        [wo.id, HOUSEHOLD_ID]
      );
      if (byLegacy.length > 0) {
        vendorOrderId = byLegacy[0].id;
        linked++;
      }
    }
    
    if (!vendorOrderId) {
      // Create new vendor_order
      vendorOrderId = nanoid();
      const orderDateMs = wo.orderDate ? new Date(wo.orderDate).getTime() : now;
      
      await conn.execute(
        `INSERT INTO vendor_orders (id, householdId, vendorAccountId, orderNumber, platform_vo, status_vo, 
         totalAmount, currency_vo, orderDate, importSource_vo, legacyWalmartOrderId, notes, createdAt_vo, updatedAt_vo)
         VALUES (?, ?, ?, ?, 'walmart', 'delivered', ?, 'USD', ?, 'legacy_migration', ?, ?, ?, ?)`,
        [vendorOrderId, HOUSEHOLD_ID, WALMART_VENDOR_ACCOUNT_ID, wo.walmartOrderId || null,
         wo.totalAmount, orderDateMs, wo.id, wo.memo || null, now, now]
      );
      
      // Create a single vendor_order_item for the whole order (since walmart_orders doesn't have line items)
      const voiId = nanoid();
      const description = wo.rawDescription || wo.itemNames ? 
        (wo.itemNames ? (typeof wo.itemNames === 'string' ? JSON.parse(wo.itemNames) : wo.itemNames).join(', ') : wo.rawDescription) :
        'Walmart purchase';
      
      await conn.execute(
        `INSERT INTO vendor_order_items (id, vendorOrderId, householdId, name, quantity, unitPrice, lineTotal, currency_voi, legacyOrderItemId, createdAt_voi, updatedAt_voi)
         VALUES (?, ?, ?, ?, 1, ?, ?, 'USD', NULL, ?, ?)`,
        [voiId, vendorOrderId, HOUSEHOLD_ID, description.slice(0, 500), wo.totalAmount, wo.totalAmount, now, now]
      );
      created++;
    }
    
    woToVoMap[wo.id] = vendorOrderId;
    
    // Update vendor_order with legacy link and receipt URL
    if (wo.receiptUrl) {
      await conn.execute(
        'UPDATE vendor_orders SET legacyWalmartOrderId = ? WHERE id = ? AND legacyWalmartOrderId IS NULL',
        [wo.id, vendorOrderId]
      );
    }
  }
  console.log(`  Linked to existing: ${linked}`);
  console.log(`  Created new: ${created}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Migrate walmart_order_categorizations → expenses
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n── Step 4: Migrating categorizations → expenses ──');
  const [categorizations] = await conn.execute('SELECT * FROM walmart_order_categorizations');
  let expensesCreated = 0;
  let expensesSkipped = 0;
  
  for (const cat of categorizations) {
    // Find the COA entry
    const coaAccountNumber = cat.category ? LEGACY_CATEGORY_MAP[cat.category] : null;
    const chartOfAccountId = coaAccountNumber ? coaLookup[coaAccountNumber] : null;
    
    if (!chartOfAccountId && cat.category) {
      console.log(`  ⚠ No COA mapping for category: "${cat.category}" — skipping`);
      expensesSkipped++;
      continue;
    }
    
    if (!chartOfAccountId) {
      console.log(`  ⚠ Null category for order ${cat.walmartOrderId.slice(0,8)} — skipping`);
      expensesSkipped++;
      continue;
    }
    
    // Get the vendor_order ID
    const vendorOrderId = woToVoMap[cat.walmartOrderId];
    if (!vendorOrderId) {
      console.log(`  ⚠ No vendor_order mapping for walmart_order ${cat.walmartOrderId.slice(0,8)} — skipping`);
      expensesSkipped++;
      continue;
    }
    
    // Get the actual vertical ID
    const verticalId = VERTICAL_NAME_TO_ID[cat.verticalName] || cat.verticalId;
    
    // Get the walmart_order for date info
    const wo = walmartOrders.find(w => w.id === cat.walmartOrderId);
    const expenseDate = wo?.orderDate ? new Date(wo.orderDate).getTime() : now;
    
    // Check if expense already exists
    const [existingExp] = await conn.execute(
      'SELECT id FROM expenses WHERE vendorOrderId_exp = ? AND chartOfAccountId_exp = ? AND householdId = ? LIMIT 1',
      [vendorOrderId, chartOfAccountId, HOUSEHOLD_ID]
    );
    if (existingExp.length > 0) {
      expensesSkipped++;
      continue;
    }
    
    const expId = nanoid();
    const amount = parseFloat(cat.splitAmount) || 0;
    const splitPct = parseFloat(cat.splitPercentage) || 100;
    
    await conn.execute(
      `INSERT INTO expenses (id, householdId, verticalId_exp, chartOfAccountId_exp, vendorOrderId_exp, 
       amount, currency_exp, description_exp, expenseDate, paymentAccountId, vendorName_exp,
       isTaxDeductible_exp, approvalStatus, source_exp, isManualOverride_exp, notes_exp,
       splitGroupId, splitAmount, splitSequence, createdAt_exp, updatedAt_exp, createdBy_exp)
       VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, 'Walmart', 0, 'approved', 'vendor_order', 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expId, HOUSEHOLD_ID, verticalId, chartOfAccountId, vendorOrderId,
        amount, cat.category || 'Uncategorized', expenseDate,
        cat.bankAccountId || null, cat.notes || null,
        // If splitPercentage < 100, this is part of a split — use nanoid as splitGroupId
        splitPct < 100 ? nanoid() : null,
        splitPct < 100 ? amount : null,
        splitPct < 100 ? (categorizations.filter(c => c.walmartOrderId === cat.walmartOrderId).indexOf(cat) + 1) : null,
        now, now, null
      ]
    );
    expensesCreated++;
  }
  console.log(`  Expenses created: ${expensesCreated}`);
  console.log(`  Expenses skipped: ${expensesSkipped}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Update vendor_orders with categorizationStatus equivalent
  // Mark orders that have been categorized
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n── Step 5: Marking categorized vendor_orders ──');
  
  // Get all walmart_orders that are categorized/split
  const [categorizedWOs] = await conn.execute(
    "SELECT id, categorizationStatus FROM walmart_orders WHERE categorizationStatus IN ('categorized', 'split') AND householdId = ?",
    [HOUSEHOLD_ID]
  );
  
  for (const wo of categorizedWOs) {
    const voId = woToVoMap[wo.id];
    if (voId) {
      // Store the categorization status in the notes field for reference
      await conn.execute(
        "UPDATE vendor_orders SET notes = CONCAT(COALESCE(notes, ''), ' [migrated: categorized]') WHERE id = ?",
        [voId]
      );
    }
  }
  console.log(`  Marked ${categorizedWOs.length} vendor_orders as categorized`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE');
  console.log('══════════════════════════════════════════');
  console.log(`  walmart_orders processed: ${walmartOrders.length}`);
  console.log(`  Linked to existing vendor_orders: ${linked}`);
  console.log(`  New vendor_orders created: ${created}`);
  console.log(`  Expenses created: ${expensesCreated}`);
  console.log(`  Expenses skipped: ${expensesSkipped}`);
  console.log('══════════════════════════════════════════\n');
  
  await conn.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
