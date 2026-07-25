import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [cols] = await pool.query('SHOW COLUMNS FROM airbnb_payout_records') as any;
  console.log('airbnb_payout_records columns:');
  for (const c of cols) console.log('  ' + c.Field);
  const [sample] = await pool.query('SELECT * FROM airbnb_payout_records LIMIT 2') as any;
  if (sample[0]) {
    console.log('\nSample row:');
    console.log(JSON.stringify(sample[0], null, 2));
  }
  await pool.end();
  process.exit(0);
}
main();
