/**
 * Fix migration journal: mark migrations 0007-0045 as already applied.
 * These were applied via direct SQL in previous sessions but not recorded
 * in the __drizzle_migrations table.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';

const journalPath = './drizzle/meta/_journal.json';
const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Get currently applied migrations
  const [rows] = await conn.query('SELECT hash FROM __drizzle_migrations');
  const appliedHashes = new Set(rows.map(r => r.hash));
  console.log(`Currently applied: ${appliedHashes.size} migrations`);
  
  // For entries 7 through 45 (indices 7-45), mark them as applied
  let inserted = 0;
  for (let i = 7; i <= 45; i++) {
    const entry = journal.entries[i];
    if (!entry) continue;
    
    const sqlFile = `./drizzle/${entry.tag}.sql`;
    let sqlContent;
    try {
      sqlContent = readFileSync(sqlFile, 'utf-8');
    } catch (e) {
      console.log(`  Skipping ${entry.tag} - file not found`);
      continue;
    }
    
    const hash = createHash('sha256').update(sqlContent).digest('hex');
    
    if (appliedHashes.has(hash)) {
      console.log(`  Already applied: ${entry.tag}`);
      continue;
    }
    
    // Insert the migration record
    const createdAt = entry.when || Date.now();
    await conn.query(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      [hash, createdAt]
    );
    inserted++;
    console.log(`  Marked as applied: ${entry.tag} (hash: ${hash.substring(0, 12)}...)`);
  }
  
  console.log(`\nDone. Inserted ${inserted} migration records.`);
  
  // Verify
  const [final] = await conn.query('SELECT COUNT(*) as cnt FROM __drizzle_migrations');
  console.log(`Total migrations now: ${final[0].cnt}`);
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
