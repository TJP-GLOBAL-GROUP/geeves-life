import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import fs from 'fs';
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get all tables
  const [tables] = await conn.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
  
  let output = '# Geeves.Life — Complete Database Schema\n';
  output += `# Generated: ${new Date().toISOString()}\n`;
  output += `# Source: Live production database\n\n`;

  for (const { TABLE_NAME } of tables) {
    output += `## ${TABLE_NAME}\n\n`;
    
    // Get columns
    const [columns] = await conn.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, CHARACTER_MAXIMUM_LENGTH
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [TABLE_NAME]
    );

    output += '| Column | Type | Nullable | Default | Key | Extra |\n';
    output += '|--------|------|----------|---------|-----|-------|\n';
    
    for (const col of columns) {
      const type = col.CHARACTER_MAXIMUM_LENGTH 
        ? `${col.DATA_TYPE}(${col.CHARACTER_MAXIMUM_LENGTH})`
        : col.COLUMN_TYPE;
      const nullable = col.IS_NULLABLE === 'YES' ? 'YES' : 'NO';
      const def = col.COLUMN_DEFAULT !== null ? col.COLUMN_DEFAULT : '';
      const key = col.COLUMN_KEY || '';
      const extra = col.EXTRA || '';
      output += `| ${col.COLUMN_NAME} | ${type} | ${nullable} | ${def} | ${key} | ${extra} |\n`;
    }

    // Get indexes
    const [indexes] = await conn.execute(
      `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS, NON_UNIQUE
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       GROUP BY INDEX_NAME, NON_UNIQUE
       ORDER BY INDEX_NAME`,
      [TABLE_NAME]
    );

    if (indexes.length > 0) {
      output += '\n**Indexes:**\n';
      for (const idx of indexes) {
        const unique = idx.NON_UNIQUE === 0 ? 'UNIQUE' : '';
        output += `- \`${idx.INDEX_NAME}\` (${idx.COLUMNS}) ${unique}\n`;
      }
    }

    output += '\n---\n\n';
  }

  // Get row counts
  output += '## Table Row Counts\n\n';
  output += '| Table | Rows |\n';
  output += '|-------|------|\n';
  for (const { TABLE_NAME } of tables) {
    const [countResult] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${TABLE_NAME}\``);
    output += `| ${TABLE_NAME} | ${countResult[0].cnt} |\n`;
  }

  fs.writeFileSync('/home/ubuntu/geeves-shopping/docs/DATABASE_SCHEMA_LIVE.md', output);
  console.log(`Schema dump complete: ${tables.length} tables documented`);
  
  await conn.end();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
