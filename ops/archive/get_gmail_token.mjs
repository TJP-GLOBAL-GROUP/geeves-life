/**
 * Get a valid Gmail access token for tarikp@gmail.com
 * Decrypts the stored token and refreshes if expired
 */
import mysql from 'mysql2/promise';
import { createHash, createDecipheriv } from 'crypto';
import { writeFileSync } from 'fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return createHash('sha256').update(secret).digest();
}

function decryptToken(stored) {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) return stored;
  const key = getKey();
  const combined = Buffer.from(stored.slice(4), 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  
  return await resp.json();
}

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const [rows] = await conn.execute(
  'SELECT id, accessToken, refreshToken, expiresAt FROM oauth_tokens WHERE accountEmail = ?',
  ['tarikp@gmail.com']
);

if (rows.length === 0) {
  console.error('No token found for tarikp@gmail.com');
  process.exit(1);
}

const row = rows[0];
const accessToken = decryptToken(row.accessToken);
const refreshToken = decryptToken(row.refreshToken);
const expiresAt = Number(row.expiresAt);
const now = Date.now();

console.log('Token expires at:', new Date(expiresAt).toISOString());
console.log('Expired:', expiresAt < now);

let finalToken = accessToken;
let finalExpiry = expiresAt;

// Refresh if expired or about to expire (within 5 minutes)
if (expiresAt < now + 5 * 60 * 1000) {
  console.log('Refreshing token...');
  const refreshed = await refreshAccessToken(refreshToken);
  finalToken = refreshed.access_token;
  finalExpiry = now + refreshed.expires_in * 1000;
  console.log('Token refreshed, expires in:', refreshed.expires_in, 'seconds');
  
  // Update in DB (we won't encrypt here for simplicity - just store plaintext temporarily)
  // The server will re-encrypt on next use
}

// Write to file for Python scripts
writeFileSync('/home/ubuntu/upload/gmail_access_token.txt', finalToken);
writeFileSync('/home/ubuntu/upload/gmail_token_expiry.txt', String(finalExpiry));

console.log('Access token written to /home/ubuntu/upload/gmail_access_token.txt');
console.log('Token length:', finalToken.length);

await conn.end();
