/**
 * Insert Section 16-17 knowledge entries into project_knowledge DB table.
 * Run once: node scripts/insert-s17-knowledge.mjs
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const entries = [
  {
    category: 'db_schema',
    key: 'chart_of_accounts',
    value: JSON.stringify({
      table: 'chart_of_accounts',
      purpose: 'Per-vertical QBO-compatible chart of accounts. Hierarchy: accountType → detailType → accountName. QBO sync fields: qboAccountId, qboFullyQualifiedName, qboSyncStatus, lastSyncedAt.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        verticalId: 'varchar(36) FK → verticals.id',
        accountType: 'enum(expense, income, asset, liability, equity, cogs)',
        detailType: 'varchar(100) — sub-classification',
        accountName: 'varchar(255) — display name',
        accountCode: 'varchar(20) nullable — user-defined code',
        qboAccountId: 'varchar(50) nullable — QuickBooks Online ID',
        qboSyncStatus: "enum(not_synced, synced, sync_failed, pending_sync)",
        isActive: 'boolean default true',
        parentAccountId: 'varchar(21) nullable — self-referential FK for sub-accounts'
      },
      uniqueConstraint: 'coa_vertical_name_uniq ON (verticalId, accountName)',
      notes: 'Seeded with standard expense categories per vertical. QBO export uses this for Bill/Expense line account mapping.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Per-vertical chart of accounts with QBO sync.'
  },
  {
    category: 'db_schema',
    key: 'vertical_financial_configs',
    value: JSON.stringify({
      table: 'vertical_financial_configs',
      purpose: '1:1 with verticals. Stores currency, reconciliation tolerances, QBO connection, tax config, match strategy. Every vertical has exactly one financial config.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        verticalId: 'varchar(36) FK → verticals.id UNIQUE',
        defaultCurrency: "varchar(3) default 'USD'",
        reconciliationToleranceCents: 'int default 50',
        autoMatchEnabled: 'boolean default true',
        matchStrategy: "enum(exact_first, fuzzy_first, manual_only) default 'exact_first'",
        qboRealmId: 'varchar(50) nullable — QBO company ID',
        qboConnectionStatus: "enum(not_connected, connected, expired, error) default 'not_connected'",
        taxEnabled: 'boolean default false',
        defaultTaxRate: 'decimal(5,4) nullable'
      },
      notes: 'Seeded for all 6 canonical verticals (Home & Family, Maxfield Bakery, Maxfield Market, Personal, StartOut, Bohemian Lodges).'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Per-vertical financial configuration.'
  },
  {
    category: 'db_schema',
    key: 'vendor_accounts',
    value: JSON.stringify({
      table: 'vendor_accounts',
      purpose: 'External vendor/merchant records. Used for matching bank transactions to orders. matchPatterns JSON stores regex/substring patterns for bank description matching.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        platform: "enum(amazon, walmart, uber, google, apple, paypal, lowes, target, home_depot, shopify, wayfair, costco, instacart, doordash, other)",
        displayName: 'varchar(255)',
        websiteUrl: 'varchar(500) nullable',
        matchPatterns: 'json — array of patterns for bank description matching',
        isActive: 'boolean default true'
      },
      notes: '14 vendors seeded. matchPatterns example: ["AMAZON.COM", "AMZN MKTP", "AMZ*"]'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Vendor accounts for transaction matching.'
  },
  {
    category: 'db_schema',
    key: 'vendor_orders',
    value: JSON.stringify({
      table: 'vendor_orders',
      purpose: 'Unified order table replacing legacy orders + walmart_orders. 424 rows migrated. Has backlinks to legacy tables via legacyOrderId/legacyWalmartOrderId.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        vendorAccountId: 'varchar(21) FK → vendor_accounts.id',
        externalOrderId: 'varchar(255) — vendor-assigned order number',
        orderDate: 'bigint — UTC ms timestamp',
        totalAmount: 'decimal(14,2)',
        currency: "varchar(3) default 'USD'",
        status: "enum(pending, confirmed, shipped, delivered, cancelled, returned)",
        legacyOrderId: 'int nullable — FK backlink to old orders table',
        legacyWalmartOrderId: 'varchar(36) nullable — FK backlink to old walmart_orders'
      },
      uniqueConstraint: 'vo_household_vendor_external_uniq ON (householdId, vendorAccountId, externalOrderId)',
      notes: 'Migrated 239 from orders + 185 from walmart_orders. Legacy tables deprecated but not dropped.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Unified vendor orders.'
  },
  {
    category: 'db_schema',
    key: 'vendor_order_items',
    value: JSON.stringify({
      table: 'vendor_order_items',
      purpose: 'Line items for vendor orders. Item-level tax, vertical, property, and chart-of-account assignment. 419 rows migrated from order_items.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        vendorOrderId: 'varchar(21) FK → vendor_orders.id',
        householdId: 'varchar(36) FK → households.id',
        productName: 'varchar(500)',
        quantity: 'int default 1',
        unitPrice: 'decimal(14,2)',
        totalPrice: 'decimal(14,2)',
        verticalId: 'varchar(36) nullable FK → verticals.id',
        propertyId: 'varchar(36) nullable FK → properties.id',
        chartOfAccountId: 'varchar(21) nullable FK → chart_of_accounts.id',
        taxAmount: 'decimal(14,2) nullable',
        taxRate: 'decimal(5,4) nullable',
        isTaxDeductible: 'boolean default false'
      },
      notes: 'Migrated 419 rows from order_items. Supports per-item vertical/property/CoA assignment for split expenses.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Vendor order items with item-level accounting.'
  },
  {
    category: 'db_schema',
    key: 'transaction_matches',
    value: JSON.stringify({
      table: 'transaction_matches',
      purpose: 'Links bank transactions to vendor orders. Supports auto and manual matching with confidence scoring.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        financialTransactionId: 'int FK → financial_transactions.id',
        vendorOrderId: 'varchar(21) FK → vendor_orders.id',
        matchMethod: "enum(auto_exact, auto_fuzzy, manual, ai_proposed)",
        confidence: 'decimal(5,4) — 0.0000 to 1.0000',
        status: "enum(proposed, confirmed, rejected)",
        matchedByUserId: 'int nullable FK → users.id',
        amountDifference: 'decimal(14,2) nullable — for fuzzy matches'
      },
      notes: '5 indexes for efficient lookup. matchMethod determines how the match was found.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16. Transaction-to-order matching table.'
  },
  {
    category: 'db_schema',
    key: 'expenses',
    value: JSON.stringify({
      table: 'expenses',
      purpose: 'The accounting event record. Approval workflow (draft → pending_approval → approved → exported). QBO export tracking. Cross-vertical + cross-property split support.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        verticalId: 'varchar(36) FK → verticals.id',
        propertyId: 'varchar(36) nullable FK → properties.id',
        chartOfAccountId: 'varchar(21) nullable FK → chart_of_accounts.id',
        bankAccountId: 'int nullable FK → bank_accounts.id',
        vendorAccountId: 'varchar(21) nullable FK → vendor_accounts.id',
        amount: 'decimal(14,2)',
        currency: "varchar(3) default 'USD'",
        description: 'varchar(500)',
        expenseDate: 'bigint — UTC ms',
        approvalStatus: "enum(draft, pending_approval, approved, rejected, exported)",
        splitGroupId: 'varchar(21) nullable — groups rows of one logical expense for cross-vertical splits',
        splitAmount: 'decimal(14,2) nullable — per-row allocation within a split group',
        splitSequence: 'int nullable — ordering within a split group',
        qboDocId: 'varchar(50) nullable',
        qboExportedAt: 'bigint nullable'
      },
      notes: 'Split pattern: splitGroupId groups ALL rows of one logical expense. Each row has own verticalId + propertyId. splitAmounts must sum to original transaction amount. QBO export groups by splitGroupId → sub-groups by verticalId → exports to respective QBO company.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16-17. Expenses with cross-vertical split pattern.'
  },
  {
    category: 'db_schema',
    key: 'notifications',
    value: JSON.stringify({
      table: 'notifications',
      purpose: 'Household-scoped notification system. Types: info, warning, success, error, action_required. Channels: in_app, email, push. Read/dismissed tracking.',
      keyColumns: {
        id: 'varchar(21) PK nanoid',
        householdId: 'varchar(36) FK → households.id',
        targetMemberId: 'varchar(36) nullable FK → household_members.id — null = broadcast to all',
        type: "enum(info, warning, success, error, action_required)",
        channel: "enum(in_app, email, push) default 'in_app'",
        title: 'varchar(255)',
        body: 'text',
        actionUrl: 'varchar(500) nullable — deep link',
        isRead: 'boolean default false',
        isDismissed: 'boolean default false',
        metadata: 'json nullable'
      },
      notes: 'Prerequisite for booking alerts, token expiry alerts, member lifecycle notifications.'
    }),
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 17. Household notification system.'
  },
  {
    category: 'architecture',
    key: 'expense split pattern',
    value: 'Cross-vertical + cross-property expense splitting: A single expense can be split across verticals AND properties simultaneously. splitGroupId groups ALL rows representing one logical expense (can span multiple verticals). Each row has own verticalId and propertyId (nullable). splitAmount values across all rows in a group MUST sum to the original transaction amount. A splitGroupId group may span multiple QBO destinations (verticals map to different QBO companies). QBO export logic: (1) group by splitGroupId, (2) sub-group by verticalId → QBO destination, (3) export each sub-group as separate Bill/Expense lines with Location set per propertyId. UI: user sees ONE expense with multi-select vertical picker, then multi-select property picker per vertical, with dollar allocation controls. Backend creates/deletes rows per selection. Frontend groups by splitGroupId (collapsed = total, expanded = per-vertical/property breakdown). PropertyAllocationPicker component handles this UI.',
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 17. Cross-vertical expense split architecture.'
  },
  {
    category: 'architecture',
    key: 'cardinal audit standard',
    value: 'All mutating tRPC procedures must call writeAuditLog() before returning success. No exceptions. The audit_log table is append-only — no UPDATE or DELETE at the application level. Ever. AI actors must set actorType = "geeves_ai" with confidence scores in metadata. Financial mutations require both previousValue and newValue JSON snapshots. 12-month minimum retention in active database. Every new module must include audit logging in its Definition of Done. Enhanced audit_log columns: actorType (enum: user/system/geeves_ai/heartbeat/migration), verticalId, previousValue (json), newValue (json). Indexes: idx_audit_actor_type, idx_audit_vertical.',
    sourceDoc: 'docs/DESIGN_PRINCIPLES.md',
    notes: 'Added Section 16. Cardinal audit standard — no mutation without attribution.'
  },
  {
    category: 'architecture',
    key: 'household member lifecycle',
    value: 'Two new procedures: household.removeMember (admin-only, full cascade + audit) and household.leaveHousehold (member-initiated, same cascade). removeMember prevents self-removal (use leaveHousehold) and admin-on-admin removal (must demote first). leaveHousehold prevents last-admin departure (must transfer role first). Cascade via deleteHouseholdMember(): revoke OAuth tokens, remove vertical access, remove permission overrides, remove member resources, cancel pending booking requests, soft-delete member row (status=removed). Shadow blocks and events retained for audit/history.',
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 17. Household member removal and departure.'
  },
  {
    category: 'deprecated_tables',
    key: 'legacy shopping tables migration',
    value: 'The following legacy tables have been migrated to new household-scoped tables and are DEPRECATED: (1) orders (61 rows) → vendor_orders; (2) order_items (419 rows) → vendor_order_items; (3) walmart_orders (185 rows, raw SQL not in Drizzle) → vendor_orders; (4) walmart_order_categorizations (3 rows) → absorbed into new model; (5) financial_accounts (4 rows) → bank_accounts (user-scoped, enhanced with householdId/cardNetwork/verticalId); (6) transactions (0 rows) → dead, never used. Do NOT build new features on these tables. Do NOT delete yet — legacy code may reference them.',
    sourceDoc: 'docs/SECTION17_KNOWLEDGE_UPDATES.md',
    notes: 'Added Section 16-17. Legacy table deprecation notice.'
  }
];

let inserted = 0;
let updated = 0;

for (const entry of entries) {
  try {
    await conn.execute(
      `INSERT INTO project_knowledge (\`category\`, \`key\`, \`value\`, sourceDoc, notes, lastReviewedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), sourceDoc = VALUES(sourceDoc), notes = VALUES(notes), lastReviewedAt = NOW(), updatedAt = NOW()`,
      [entry.category, entry.key, entry.value, entry.sourceDoc, entry.notes]
    );
    const [result] = await conn.execute(`SELECT ROW_COUNT() as rc`);
    if (result[0].rc === 1) inserted++;
    else updated++;
    console.log(`✓ ${entry.category}/${entry.key}`);
  } catch (err) {
    console.error(`✗ ${entry.category}/${entry.key}: ${err.message}`);
  }
}

console.log(`\nDone: ${inserted} inserted, ${updated} updated`);
await conn.end();
