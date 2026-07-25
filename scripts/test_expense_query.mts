import { getDb } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log("DB unavailable"); process.exit(1); }

  // Simulate the getOrders query with status='pending' using the FIXED query
  const rows = await db.execute(sql`
    SELECT vo.id, vo.orderNumber, vo.platform_vo as platform, vo.status_vo as orderStatus,
           vo.totalAmount, vo.orderDate, vo.currency_vo as currency,
           vo.notes, vo.legacyWalmartOrderId,
           va.vendorName,
           CASE
             WHEN vo.notes LIKE '%[skipped]%' THEN 'skipped'
             WHEN eFirst.firstExpId IS NOT NULL AND COALESCE(sg.splitCount, 0) > 1 THEN 'split'
             WHEN eFirst.firstExpId IS NOT NULL THEN 'categorized'
             ELSE 'pending'
           END as categorizationStatus,
           COALESCE(sg.splitCount, 0) as splitCount,
           (SELECT GROUP_CONCAT(voi.name SEPARATOR ', ')
            FROM vendor_order_items voi WHERE voi.vendorOrderId = vo.id) as itemSummary
    FROM vendor_orders vo
    LEFT JOIN vendor_accounts va ON va.id = vo.vendorAccountId
    LEFT JOIN (
      SELECT vendorOrderId_exp, MIN(id) as firstExpId
      FROM expenses
      WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
      GROUP BY vendorOrderId_exp
    ) eFirst ON eFirst.vendorOrderId_exp = vo.id
    LEFT JOIN expenses e ON e.id = eFirst.firstExpId
    LEFT JOIN (
      SELECT vendorOrderId_exp, COUNT(DISTINCT id) as splitCount
      FROM expenses
      WHERE householdId = 'V8lk3KJatvxBTWURf4uo9'
      GROUP BY vendorOrderId_exp
    ) sg ON sg.vendorOrderId_exp = vo.id
    WHERE vo.householdId = 'V8lk3KJatvxBTWURf4uo9'
      AND eFirst.firstExpId IS NULL AND (vo.notes IS NULL OR vo.notes NOT LIKE '%[skipped]%')
    ORDER BY vo.orderDate DESC
    LIMIT 20 OFFSET 0
  `);
  const result = Array.isArray(rows) ? rows[0] : rows;
  console.log('Count:', (result as any[]).length);
  if ((result as any[]).length > 0) {
    console.log('First 3:', JSON.stringify((result as any[]).slice(0, 3), null, 2));
  }

  // Also test what happens with notes = NULL
  const nullNotesCount = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM vendor_orders 
    WHERE householdId = 'V8lk3KJatvxBTWURf4uo9' AND notes IS NULL
  `);
  const nnResult = Array.isArray(nullNotesCount) ? nullNotesCount[0] : nullNotesCount;
  console.log('Orders with NULL notes:', JSON.stringify(nnResult));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
