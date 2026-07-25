import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check TiDB version
const [ver] = await conn.execute("SELECT VERSION()");
console.log("TiDB version:", ver[0]['VERSION()']);

// Check if triggers are supported
try {
  const [result] = await conn.execute("SHOW VARIABLES LIKE '%trigger%'");
  console.log("Trigger vars:", result);
} catch (e) {
  console.log("No trigger vars found");
}

// Try the most basic trigger syntax possible
try {
  await conn.execute("CREATE TRIGGER test_trg AFTER INSERT ON ics_regeneration_queue FOR EACH ROW INSERT INTO ics_regeneration_queue (propertyId, reason, createdAt) VALUES ('test', 'test', 0)");
  console.log("Basic trigger works!");
  await conn.execute("DROP TRIGGER test_trg");
} catch (e) {
  console.log("Basic trigger failed:", e.message);
}

await conn.end();
