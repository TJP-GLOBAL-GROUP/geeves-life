import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: parseInt(m[4]),
  user: m[1], password: m[2],
  database: m[5].split('?')[0],
  ssl: { rejectUnauthorized: false }
});

// 1. Add calendarExclusions to vertical_visibility (already done, but safe to re-run)
await conn.execute(`
  ALTER TABLE vertical_visibility
  ADD COLUMN IF NOT EXISTS calendarExclusions JSON NULL
`).catch(e => console.log('calendarExclusions already exists:', e.message));

// 2. Create shadow_overrides table
await conn.execute(`
  CREATE TABLE IF NOT EXISTS shadow_overrides (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    eventId VARCHAR(36) NOT NULL,
    calendarId VARCHAR(36) NOT NULL,
    action ENUM('include', 'exclude') NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_calendar (eventId, calendarId)
  )
`).catch(e => console.log('shadow_overrides error:', e.message));

console.log('Migration complete');
await conn.end();
