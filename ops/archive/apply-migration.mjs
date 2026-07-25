/**
 * Apply a migration file statement by statement, skipping already-applied ones.
 * Usage: node scripts/apply-migration.mjs <migration-file>
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const migrationFile = process.argv[2];
if (!migrationFile) { console.error('Usage: node apply-migration.mjs <file>'); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const sql = readFileSync(migrationFile, 'utf-8');
  const statements = sql.split('--> statement-breakpoint\n').map(s => s.trim()).filter(Boolean);
  
  console.log(`Applying ${migrationFile} (${statements.length} statements)`);
  let applied = 0, skipped = 0, failed = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].replace(/--> statement-breakpoint$/, '').trim();
    if (!stmt) continue;
    try {
      await conn.query(stmt);
      applied++;
      console.log(`  [${i+1}] OK`);
    } catch (err) {
      if (err.errno === 1050 || err.errno === 1060 || err.errno === 1061) {
        skipped++;
        console.log(`  [${i+1}] SKIP: ${err.sqlMessage?.substring(0, 60)}`);
      } else {
        failed++;
        console.log(`  [${i+1}] FAIL: ${err.sqlMessage?.substring(0, 100)}`);
      }
    }
  }
  
  console.log(`\nResult: ${applied} applied, ${skipped} skipped, ${failed} failed`);
  
  // Mark in journal
  const hash = createHash('sha256').update(sql).digest('hex');
  try {
    await conn.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hash, Date.now()]);
    console.log(`Migration marked as applied (hash: ${hash.substring(0, 12)}...)`);
  } catch (e) {
    if (e.errno === 1062) console.log('Already in journal');
    else console.log(`Journal warning: ${e.message}`);
  }
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
