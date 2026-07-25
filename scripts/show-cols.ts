import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [cols] = await pool.query("SHOW COLUMNS FROM property_bookings") as any;
  console.log(cols.map((c: any) => c.Field).join(", "));
  await pool.end();
}
main();
