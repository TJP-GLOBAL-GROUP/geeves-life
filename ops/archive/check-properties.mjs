import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env from .env file if present
try {
  const env = readFileSync('/home/ubuntu/geeves-shopping/.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/([^?]+)/);
if (!m) { console.log('No DB URL'); process.exit(1); }

const conn = await createConnection({
  host: m[3], port: parseInt(m[4] || '3306'),
  user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

const [props] = await conn.query('SELECT id, name, type FROM properties LIMIT 10');
console.log('\nPROPERTIES:', JSON.stringify(props, null, 2));

const [plats] = await conn.query('SELECT id, propertyId, platform, icalUrl, lastPolledAt, lastError FROM property_platforms LIMIT 10');
console.log('\nPLATFORMS:', JSON.stringify(plats, null, 2));

const [bookings] = await conn.query('SELECT id, propertyId, summary, checkIn, checkOut, bookingType FROM property_bookings LIMIT 10');
console.log('\nBOOKINGS:', JSON.stringify(bookings, null, 2));

const [calRows] = await conn.query("SELECT id, name, provider, externalId FROM calendars WHERE provider='ical' OR name LIKE '%property%' OR name LIKE '%Sunset%' OR name LIKE '%Morabeza%' LIMIT 20");
console.log('\nPROPERTY CALENDARS:', JSON.stringify(calRows, null, 2));

await conn.end();
