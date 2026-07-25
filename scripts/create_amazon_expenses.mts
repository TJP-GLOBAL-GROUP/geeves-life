import { getDb } from '../server/db.ts';
import { bankAccounts } from '../drizzle/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const USER_ID = 1;
const AMAZON_VENDOR_ACCOUNT_ID = '1xodoVrwoqtTF1GfMUyQc';

// Expenses table columns:
// id, householdId, verticalId_exp, propertyId_exp, chartOfAccountId_exp, vendorOrderItemId,
// vendorOrderId_exp, financialTransactionId_exp, transactionMatchId, amount, currency_exp,
// description_exp, expenseDate, paymentMethod_exp, paymentAccountId, vendorName_exp,
// isTaxDeductible_exp, taxCategory_exp, taxFormLine_exp, approvalStatus, approvedBy, approvedAt,
// qboExportStatus, qboExpenseId, qboExportedAt, qboExportError, receiptUrl_exp, source_exp,
// aiConfidence_exp, isManualOverride_exp, notes_exp, createdAt_exp, updatedAt_exp, createdBy_exp,
// splitGroupId, splitAmount, splitSequence

async function main() {
  const db = await getDb();

  // Get bank accounts for payment matching
  const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, USER_ID));
  const accountByLast4 = new Map<string, number>();
  for (const a of accounts) {
    if (a.lastFourDigits) accountByLast4.set(a.lastFourDigits, a.id);
  }
  console.log(`Bank accounts loaded: ${accounts.length}`);

  // Get 2025-2026 Amazon orders without expenses
  // Jan 1 2025 = 1735689600000
  const [orders] = await db.execute(sql`
    SELECT vo.id, vo.orderNumber, vo.totalAmount, vo.orderDate, vo.paymentMethod, vo.paymentCardLast4
    FROM vendor_orders vo
    WHERE vo.vendorAccountId = ${AMAZON_VENDOR_ACCOUNT_ID}
      AND vo.orderDate >= 1735689600000
      AND vo.status_vo != 'cancelled'
      AND vo.id NOT IN (SELECT vendorOrderId_exp FROM expenses WHERE vendorOrderId_exp IS NOT NULL)
    ORDER BY vo.orderDate DESC
  `);

  const orderRows = orders as any[];
  console.log(`2025-2026 Amazon orders without expenses: ${orderRows.length}`);

  if (orderRows.length === 0) {
    console.log('No orders need expense records. Done!');
    process.exit(0);
  }

  // Create expense records for each order
  let created = 0;
  for (const order of orderRows) {
    const expenseId = randomUUID().replace(/-/g, '').slice(0, 21);
    const amount = parseFloat(order.totalAmount || '0');
    if (amount <= 0) continue;

    // Match payment card to bank account
    const paymentAccountId = order.paymentCardLast4 ? (accountByLast4.get(order.paymentCardLast4) || null) : null;

    // Get first item name for description
    const [items] = await db.execute(sql`
      SELECT name FROM vendor_order_items WHERE vendorOrderId = ${order.id} LIMIT 1
    `);
    const firstItem = (items as any[])[0];
    const description = firstItem?.name 
      ? `Amazon: ${firstItem.name.substring(0, 100)}`
      : `Amazon Order #${order.orderNumber}`;

    await db.execute(sql`
      INSERT INTO expenses (id, householdId, verticalId_exp, chartOfAccountId_exp, vendorOrderId_exp, amount, currency_exp, description_exp,
        expenseDate, paymentMethod_exp, paymentAccountId, vendorName_exp, source_exp, 
        approvalStatus, createdAt_exp, updatedAt_exp, createdBy_exp)
      VALUES (${expenseId}, ${HOUSEHOLD_ID}, 'tjpfam-vert-home', 'vL-5dc1S8gevFdICnT4tU', ${order.id}, ${amount.toFixed(2)}, 'USD', ${description},
        ${order.orderDate}, ${order.paymentMethod || 'Unknown'}, ${paymentAccountId},
        'Amazon', 'vendor_order', 'pending_review', NOW(), NOW(), ${USER_ID})
    `);
    created++;
    if (created % 20 === 0) console.log(`  Created ${created}/${orderRows.length} expenses...`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Expenses created: ${created}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
