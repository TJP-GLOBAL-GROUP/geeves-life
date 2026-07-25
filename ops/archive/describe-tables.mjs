import { createConnection } from "mysql2/promise";
const conn = await createConnection(process.env.DATABASE_URL);
const [pb] = await conn.query("DESCRIBE property_bookings");
console.log("property_bookings:", pb.map(c => c.Field).join(", "));
const [pp] = await conn.query("DESCRIBE property_platforms");
console.log("property_platforms:", pp.map(c => c.Field).join(", "));
await conn.end();
