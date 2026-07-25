import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [cols] = await pool.query("SHOW COLUMNS FROM property_bookings WHERE Field LIKE '%plat%' OR Field LIKE '%source%' OR Field LIKE '%Source%'");
  console.log(JSON.stringify(cols, null, 2));
  await pool.end();
  process.exit(0);
}
main();
