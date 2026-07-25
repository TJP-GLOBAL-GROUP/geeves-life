import mysql2 from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config({ path: "/home/ubuntu/geeves-shopping/.env" });

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+):?(\d*)\/([^?]+)/);
const conn = await mysql2.createConnection({
  host: m[3], port: parseInt(m[4] || "3306"),
  user: m[1], password: m[2],
  database: m[5].split("?")[0],
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute(`
  SELECT c.name, c.id as calendarId, wc.status, wc.expiresAt, wc.createdAt
  FROM webhook_channels wc
  JOIN calendars c ON c.id = wc.calendarId
  WHERE wc.status = 'active'
  ORDER BY wc.createdAt DESC
  LIMIT 20
`);
console.log("Active webhook channels (most recent 20):");
for (const r of rows) {
  const exp = new Date(Number(r.expiresAt)).toISOString();
  console.log(`  ${r.name.padEnd(50)} expires: ${exp}`);
}

const [total] = await conn.execute(`SELECT COUNT(*) as n FROM webhook_channels WHERE status='active'`);
console.log(`\nTotal active channels: ${total[0].n}`);

await conn.end();
