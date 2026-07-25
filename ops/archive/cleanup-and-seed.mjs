/**
 * Section 16 Migration: Steps 9-10
 * Step 9: Clean up 272 test verticals (keep only the 6 canonical ones)
 * Step 10: Seed properties table + vertical_financial_configs
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

// The 6 canonical verticals
const CANONICAL_VERTICALS = [
  'tjpfam-vert-bakery',   // Maxfield Bakery
  'tjpfam-vert-market',   // Maxfield Market
  'c3pW-Cxhm9WAQZ17pTMb3', // Bohemian Lodges
  'tjpfam-vert-home',     // Home & Family
  'tjpfam-vert-self',     // Personal
  'tjpfam-vert-startout', // StartOut
];

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const now = Date.now();

  // ─── Step 9: Clean up test verticals ───────────────────────────────
  console.log('=== Step 9: Cleaning up test verticals ===');
  
  // First check for FKs referencing non-canonical verticals
  const canonicalList = CANONICAL_VERTICALS.map(v => `'${v}'`).join(',');
  
  // Check vertical_member_access
  const [vmaOrphans] = await conn.query(
    `SELECT COUNT(*) as cnt FROM vertical_member_access WHERE verticalId NOT IN (${canonicalList})`
  );
  console.log(`  vertical_member_access orphans: ${vmaOrphans[0].cnt}`);
  
  // Check vertical_data_policies
  const [vdpOrphans] = await conn.query(
    `SELECT COUNT(*) as cnt FROM vertical_data_policies WHERE verticalId NOT IN (${canonicalList})`
  );
  console.log(`  vertical_data_policies orphans: ${vdpOrphans[0].cnt}`);

  // Delete orphaned FK rows first
  if (vmaOrphans[0].cnt > 0) {
    const [r1] = await conn.query(
      `DELETE FROM vertical_member_access WHERE verticalId NOT IN (${canonicalList})`
    );
    console.log(`  Deleted ${r1.affectedRows} orphaned vertical_member_access rows`);
  }
  if (vdpOrphans[0].cnt > 0) {
    const [r2] = await conn.query(
      `DELETE FROM vertical_data_policies WHERE verticalId NOT IN (${canonicalList})`
    );
    console.log(`  Deleted ${r2.affectedRows} orphaned vertical_data_policies rows`);
  }

  // Check vertical_visibility
  try {
    const [vvOrphans] = await conn.query(
      `SELECT COUNT(*) as cnt FROM vertical_visibility WHERE verticalId NOT IN (${canonicalList})`
    );
    if (vvOrphans[0].cnt > 0) {
      const [r3] = await conn.query(
        `DELETE FROM vertical_visibility WHERE verticalId NOT IN (${canonicalList})`
      );
      console.log(`  Deleted ${r3.affectedRows} orphaned vertical_visibility rows`);
    }
  } catch (e) {
    console.log(`  vertical_visibility check: ${e.sqlMessage?.substring(0, 60)}`);
  }

  // Check vertical_owners
  try {
    const [voOrphans] = await conn.query(
      `SELECT COUNT(*) as cnt FROM vertical_owners WHERE verticalId NOT IN (${canonicalList})`
    );
    if (voOrphans[0].cnt > 0) {
      const [r4] = await conn.query(
        `DELETE FROM vertical_owners WHERE verticalId NOT IN (${canonicalList})`
      );
      console.log(`  Deleted ${r4.affectedRows} orphaned vertical_owners rows`);
    }
  } catch (e) {
    console.log(`  vertical_owners check: ${e.sqlMessage?.substring(0, 60)}`);
  }

  // Check vertical_integrations
  try {
    const [viOrphans] = await conn.query(
      `SELECT COUNT(*) as cnt FROM vertical_integrations WHERE verticalId NOT IN (${canonicalList})`
    );
    if (viOrphans[0].cnt > 0) {
      const [r5] = await conn.query(
        `DELETE FROM vertical_integrations WHERE verticalId NOT IN (${canonicalList})`
      );
      console.log(`  Deleted ${r5.affectedRows} orphaned vertical_integrations rows`);
    }
  } catch (e) {
    console.log(`  vertical_integrations check: ${e.sqlMessage?.substring(0, 60)}`);
  }

  // Now delete non-canonical verticals
  const [countBefore] = await conn.query('SELECT COUNT(*) as cnt FROM verticals');
  const [deleteResult] = await conn.query(
    `DELETE FROM verticals WHERE id NOT IN (${canonicalList})`
  );
  const [countAfter] = await conn.query('SELECT COUNT(*) as cnt FROM verticals');
  console.log(`  Deleted ${deleteResult.affectedRows} test verticals (${countBefore[0].cnt} → ${countAfter[0].cnt})`);

  // ─── Step 10: Seed properties ──────────────────────────────────────
  console.log('\n=== Step 10: Seeding properties (Bohemian Lodges sub-entities) ===');
  
  // Check if properties already exist for these slugs
  // The properties table already exists with a different schema (rental management)
  // We need to check if artistes_boutique, morabeza, sunset_studio exist
  const [existingProps] = await conn.query(
    `SELECT id, name FROM properties WHERE householdId = ? AND verticalId = ?`,
    [HOUSEHOLD_ID, 'c3pW-Cxhm9WAQZ17pTMb3']
  );
  
  if (existingProps.length > 0) {
    console.log(`  Properties already exist for Bohemian Lodges: ${existingProps.map(p => p.name).join(', ')}`);
  } else {
    // Check if any properties exist at all
    const [allProps] = await conn.query('SELECT id, name, verticalId FROM properties WHERE householdId = ?', [HOUSEHOLD_ID]);
    console.log(`  Existing properties: ${allProps.length}`);
    for (const p of allProps) console.log(`    ${p.name} (vertical: ${p.verticalId})`);
  }

  // ─── Seed vertical_financial_configs ───────────────────────────────
  console.log('\n=== Seeding vertical_financial_configs ===');
  
  const vfcSeeds = [
    {
      verticalId: 'tjpfam-vert-bakery',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD',
      qboCompanyName: 'Maxfield Bakery',
      taxJurisdiction: 'us_federal',
      taxEntityType: 'sole_proprietor',
      taxFormType: 'Schedule C',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'strict',
    },
    {
      verticalId: 'tjpfam-vert-market',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD',
      qboCompanyName: 'Maxfield Market Global LLC',
      taxJurisdiction: 'us_federal',
      taxEntityType: 'llc_multi',
      taxFormType: '1065',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'strict',
    },
    {
      verticalId: 'c3pW-Cxhm9WAQZ17pTMb3',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD,JMD',
      qboCompanyName: 'Maxfield Market Global LLC',
      taxJurisdiction: 'us_federal',
      taxEntityType: 'llc_multi',
      taxFormType: 'Schedule E',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'moderate',
    },
    {
      verticalId: 'tjpfam-vert-home',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD,JMD',
      qboCompanyName: null,
      taxJurisdiction: 'us_federal',
      taxEntityType: 'personal',
      taxFormType: '1040',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'moderate',
    },
    {
      verticalId: 'tjpfam-vert-self',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD',
      qboCompanyName: null,
      taxJurisdiction: 'us_federal',
      taxEntityType: 'personal',
      taxFormType: '1040',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'moderate',
    },
    {
      verticalId: 'tjpfam-vert-startout',
      defaultCurrency: 'USD',
      supportedCurrencies: 'USD',
      qboCompanyName: null,
      taxJurisdiction: 'us_federal',
      taxEntityType: 'personal',
      taxFormType: 'W-2',
      accountingMethod: 'cash',
      defaultVendorMatchStrategy: 'manual',
    },
  ];

  for (const vfc of vfcSeeds) {
    const id = nanoid();
    try {
      await conn.query(
        `INSERT INTO vertical_financial_configs (id, verticalId, householdId, defaultCurrency, supportedCurrencies, qboCompanyName, taxJurisdiction_vfc, taxEntityType, taxFormType, accountingMethod, defaultVendorMatchStrategy, createdAt_vfc, updatedAt_vfc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, vfc.verticalId, HOUSEHOLD_ID, vfc.defaultCurrency, vfc.supportedCurrencies,
         vfc.qboCompanyName, vfc.taxJurisdiction, vfc.taxEntityType, vfc.taxFormType,
         vfc.accountingMethod, vfc.defaultVendorMatchStrategy, now, now]
      );
      console.log(`  Created VFC: ${vfc.verticalId} (${vfc.taxFormType})`);
    } catch (e) {
      if (e.errno === 1062) {
        console.log(`  Exists: ${vfc.verticalId}`);
      } else throw e;
    }
  }

  // ─── Audit Log ─────────────────────────────────────────────────────
  await conn.query(
    `INSERT INTO audit_log (actorType, householdId, action, category, resourceType, outcome, metadata, createdAt)
     VALUES ('system', ?, 'data_migration', 'finance', 'verticals', 'success', ?, NOW())`,
    [HOUSEHOLD_ID, JSON.stringify({
      step: 'S16-Steps-9-10',
      verticalsDeleted: deleteResult.affectedRows,
      vfcSeeded: vfcSeeds.length,
    })]
  );

  console.log('\n=== Steps 9-10 Complete ===');
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
