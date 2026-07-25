/**
 * Apply migration 0046 statements one by one, skipping those that fail
 * due to already-existing objects.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  const sql = readFileSync('./drizzle/0046_wonderful_the_twelve.sql', 'utf-8');
  const statements = sql.split('--> statement-breakpoint\n').map(s => s.trim()).filter(Boolean);
  
  console.log(`Total statements: ${statements.length}`);
  
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].replace(/--> statement-breakpoint$/, '').trim();
    if (!stmt) continue;
    
    try {
      await conn.query(stmt);
      applied++;
      console.log(`  [${i+1}] OK`);
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
          err.code === 'ER_DUP_FIELDNAME' || 
          err.code === 'ER_DUP_KEYNAME' ||
          err.errno === 1050 || // table exists
          err.errno === 1060 || // duplicate column
          err.errno === 1061) { // duplicate key name
        skipped++;
        console.log(`  [${i+1}] SKIP (already exists): ${err.sqlMessage?.substring(0, 60)}`);
      } else {
        failed++;
        console.log(`  [${i+1}] FAIL: ${err.sqlMessage?.substring(0, 80)}`);
      }
    }
  }
  
  console.log(`\nDone: ${applied} applied, ${skipped} skipped, ${failed} failed`);
  
  // Mark migration 0046 as applied
  const hash = createHash('sha256').update(sql).digest('hex');
  try {
    await conn.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hash, Date.now()]);
    console.log('Migration 0046 marked as applied in journal');
  } catch (e) {
    if (e.errno === 1062) {
      console.log('Migration 0046 already in journal');
    } else {
      console.log(`Warning: Could not mark migration: ${e.message}`);
    }
  }
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
