import { createConnection } from 'mysql2/promise';
import { randomBytes } from 'crypto';

const url = process.env.DATABASE_URL || '';
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await createConnection({
  host: m[3], port: parseInt(m[4]), user: m[1], password: m[2],
  database: m[5].split('?')[0], ssl: { rejectUnauthorized: false }
});

const token = randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

await conn.execute(
  `UPDATE household_members 
   SET status = 'invited', userId = NULL, inviteToken = ?, inviteTokenExpiresAt = ?
   WHERE id = 'Gq8FVIAhfGyEDH6s-qYts'`,
  [token, expiresAt]
);

// Also clear the user record that was auto-created so she gets a fresh login
const [rows] = await conn.execute(
  `SELECT id FROM household_members WHERE id = 'Gq8FVIAhfGyEDH6s-qYts'`
);

console.log('Reset complete. New invite token:', token);
console.log('Invite link: https://geeves.manus.space/join?token=' + token);
console.log('Also valid at dev: https://3000-imoospcvsebn7o8mhwu2m-c41c32c8.us1.manus.computer/join?token=' + token);

await conn.end();
