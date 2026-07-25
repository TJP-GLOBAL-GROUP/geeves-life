/**
 * Section 16 Migration: Steps 7-8
 * Step 7: Migrate financial_accounts (4 rows) → bank_accounts (user-scoped)
 *         - Add cardNetwork, householdId columns to bank_accounts
 *         - Backfill 1,309 FKs in financial_transactions
 * Step 8: Add verticalId column to financial_transactions
 *         - Backfill from enum vertical → verticalId FK
 *         - Mapping: personal→tjpfam-vert-self, artistes_boutique/morabeza/sunset_studio→c3pW-Cxhm9WAQZ17pTMb3, maxfield_bakery→tjpfam-vert-bakery
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';
const USER_ID = 1; // Owner user ID for the bank_accounts user-scoped table

// Vertical mapping from enum values to verticalId
const VERTICAL_MAP = {
  'personal': 'tjpfam-vert-self',
  'artistes_boutique': 'c3pW-Cxhm9WAQZ17pTMb3',
  'morabeza': 'c3pW-Cxhm9WAQZ17pTMb3',
  'sunset_studio': 'c3pW-Cxhm9WAQZ17pTMb3',
  'maxfield_bakery': 'tjpfam-vert-bakery',
  'multi': null,
  'unclassified': null,
};

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  // ─── Step 7: Enhance bank_accounts + migrate financial_accounts ────
  console.log('=== Step 7: Enhancing bank_accounts table ===');
  
  // Add householdId column if not exists
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN householdId varchar(36) AFTER userId`);
    console.log('  Added householdId column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  householdId already exists on bank_accounts');
    else throw e;
  }

  // Add cardNetwork column
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN cardNetwork varchar(20) AFTER lastFourDigits`);
    console.log('  Added cardNetwork column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  cardNetwork already exists on bank_accounts');
    else throw e;
  }

  // Add accountNumber column (full number for reconciliation)
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN accountNumber varchar(50) AFTER cardNetwork`);
    console.log('  Added accountNumber column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  accountNumber already exists on bank_accounts');
    else throw e;
  }

  // Add creditLimit column
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN creditLimit decimal(14,2) AFTER accountNumber`);
    console.log('  Added creditLimit column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  creditLimit already exists on bank_accounts');
    else throw e;
  }

  // Add verticalId column
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN verticalId varchar(36) AFTER creditLimit`);
    console.log('  Added verticalId column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  verticalId already exists on bank_accounts');
    else throw e;
  }

  // Add notes column
  try {
    await conn.query(`ALTER TABLE bank_accounts ADD COLUMN notes text AFTER verticalId`);
    console.log('  Added notes column to bank_accounts');
  } catch (e) {
    if (e.errno === 1060) console.log('  notes already exists on bank_accounts');
    else throw e;
  }

  // Expand accountType enum to include all types from financial_accounts
  try {
    await conn.query(`ALTER TABLE bank_accounts MODIFY COLUMN accountType enum('checking','savings','credit_card','business_checking','business_savings','business_credit','chequing','business_chequing','investment','airbnb_payout') NOT NULL`);
    console.log('  Expanded accountType enum');
  } catch (e) {
    console.log(`  accountType enum expansion: ${e.sqlMessage?.substring(0, 80)}`);
  }

  // Now migrate financial_accounts → bank_accounts
  console.log('\n  Migrating financial_accounts → bank_accounts...');
  const [faRows] = await conn.query('SELECT * FROM financial_accounts');
  console.log(`  Found ${faRows.length} financial_accounts to migrate`);

  const faIdToBaIdMap = {}; // financial_accounts.id → bank_accounts.id

  for (const fa of faRows) {
    // Map vertical enum to verticalId
    const verticalId = VERTICAL_MAP[fa.vertical] || null;

    // Check if already migrated (by matching institution + lastFourDigits)
    const [existing] = await conn.query(
      'SELECT id FROM bank_accounts WHERE institution = ? AND lastFourDigits = ? AND userId = ?',
      [fa.institution, fa.lastFourDigits, USER_ID]
    );

    if (existing.length > 0) {
      faIdToBaIdMap[fa.id] = existing[0].id;
      console.log(`  Already exists: ${fa.accountName} → bank_accounts.id=${existing[0].id}`);
      // Update with new fields
      await conn.query(
        'UPDATE bank_accounts SET householdId = ?, accountNumber = ?, creditLimit = ?, verticalId = ?, notes = ? WHERE id = ?',
        [HOUSEHOLD_ID, fa.accountNumber, fa.creditLimitJMD, verticalId, fa.notes, existing[0].id]
      );
      continue;
    }

    // Insert new row
    const [result] = await conn.query(
      `INSERT INTO bank_accounts (userId, householdId, institution, accountName, accountType, category, currency, lastFourDigits, accountNumber, creditLimit, verticalId, notes, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [USER_ID, HOUSEHOLD_ID, fa.institution, fa.accountName, fa.accountType,
       fa.accountType.includes('business') ? 'business' : 'personal',
       fa.currency, fa.lastFourDigits, fa.accountNumber, fa.creditLimitJMD,
       verticalId, fa.notes, fa.isActive]
    );
    faIdToBaIdMap[fa.id] = result.insertId;
    console.log(`  Migrated: ${fa.accountName} → bank_accounts.id=${result.insertId}`);
  }

  // Backfill financial_transactions with bankAccountId FK
  console.log('\n  Backfilling financial_transactions with bankAccountId...');
  try {
    await conn.query(`ALTER TABLE financial_transactions ADD COLUMN bankAccountId int AFTER accountId`);
    console.log('  Added bankAccountId column');
  } catch (e) {
    if (e.errno === 1060) console.log('  bankAccountId already exists');
    else throw e;
  }

  for (const [faId, baId] of Object.entries(faIdToBaIdMap)) {
    const [result] = await conn.query(
      'UPDATE financial_transactions SET bankAccountId = ? WHERE accountId = ?',
      [baId, faId]
    );
    console.log(`  Updated ${result.affectedRows} transactions: accountId=${faId} → bankAccountId=${baId}`);
  }

  // ─── Step 8: Add verticalId to financial_transactions ──────────────
  console.log('\n=== Step 8: Adding verticalId to financial_transactions ===');
  
  try {
    await conn.query(`ALTER TABLE financial_transactions ADD COLUMN verticalId varchar(36) AFTER vertical`);
    console.log('  Added verticalId column');
  } catch (e) {
    if (e.errno === 1060) console.log('  verticalId already exists');
    else throw e;
  }

  // Backfill verticalId from enum values
  for (const [enumVal, vertId] of Object.entries(VERTICAL_MAP)) {
    if (!vertId) continue;
    const [result] = await conn.query(
      'UPDATE financial_transactions SET verticalId = ? WHERE vertical = ?',
      [vertId, enumVal]
    );
    console.log(`  Mapped '${enumVal}' → ${vertId}: ${result.affectedRows} rows`);
  }

  // Add index on verticalId
  try {
    await conn.query('CREATE INDEX ft_verticalId_idx ON financial_transactions (verticalId)');
    console.log('  Added index on verticalId');
  } catch (e) {
    if (e.errno === 1061) console.log('  Index already exists');
    else console.log(`  Index: ${e.sqlMessage?.substring(0, 60)}`);
  }

  // ─── Audit Log ─────────────────────────────────────────────────────
  await conn.query(
    `INSERT INTO audit_log (actorType, householdId, action, category, resourceType, outcome, metadata, createdAt)
     VALUES ('system', ?, 'data_migration', 'finance', 'financial_accounts', 'success', ?, NOW())`,
    [HOUSEHOLD_ID, JSON.stringify({
      step: 'S16-Steps-7-8',
      accountsMigrated: Object.keys(faIdToBaIdMap).length,
      verticalBackfill: true,
    })]
  );

  console.log('\n=== Steps 7-8 Complete ===');
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
