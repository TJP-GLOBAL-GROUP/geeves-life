import mysql from "mysql2/promise";

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows]: any = await conn.execute(
    "SELECT id, memberId, accountEmail, provider, purposes, LEFT(refreshToken, 30) as rt_prefix, updatedAt FROM oauth_tokens WHERE memberId = '5oijHdMcqgQHvtuCvu2Cm'"
  );
  console.log("All tokens for Tarik (member 5oijHdMcqgQHvtuCvu2Cm):");
  for (const r of rows) {
    console.log(`  ${r.accountEmail} | purposes: ${r.purposes} | rt: ${r.rt_prefix}... | updated: ${r.updatedAt}`);
  }
  await conn.end();
}
check();
