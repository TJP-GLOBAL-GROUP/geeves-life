import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [rows] = await pool.query("SELECT id, name FROM properties") as any;
  for (const r of rows) {
    console.log(`${r.id} | ${r.name}`);
  }
  await pool.end();
}

main();
