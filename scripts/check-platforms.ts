import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [cols] = await pool.query("SHOW COLUMNS FROM property_platforms");
  console.log("property_platforms columns:", JSON.stringify((cols as any[]).map(c => c.Field)));
  
  const [sample] = await pool.query("SELECT * FROM property_platforms LIMIT 5");
  console.log("\nSample data:", JSON.stringify(sample, null, 2));
  
  await pool.end();
  process.exit(0);
}
main();
