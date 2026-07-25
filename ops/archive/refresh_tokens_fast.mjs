/**
 * Fast token refresher - gets one token at a time with timeout
 */
import mysql from 'mysql2/promise';
import { createHash, createDecipheriv } from 'crypto';
import { writeFileSync } from 'fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  return createHash('sha256').update(process.env.JWT_SECRET).digest();
}

function decryptToken(stored) {
  if (!stored || !stored.startsWith('enc:')) return stored;
  const key = getKey();
  const combined = Buffer.from(stored.slice(4), 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function refreshToken(refreshToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      signal: controller.signal,
    });
    const data = await resp.json();
    return data.access_token || null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Get all Gmail tokens with refresh tokens
const [rows] = await db.execute(`
  SELECT accountEmail, accessToken, refreshToken, scopes
  FROM oauth_tokens
  WHERE provider = 'google'
  AND scopes LIKE '%gmail%'
  ORDER BY updatedAt DESC
`);

await db.end();

const tokens = {};
for (const row of rows) {
  const email = row.accountEmail;
  if (tokens[email]) continue; // already have this account
  
  const refreshTok = decryptToken(row.refreshToken);
  if (!refreshTok) {
    console.log(`${email}: no refresh token`);
    continue;
  }
  
  console.log(`Refreshing ${email}...`);
  const accessToken = await refreshToken(refreshTok);
  if (accessToken) {
    tokens[email] = accessToken;
    console.log(`  ✓ Got token for ${email}`);
  } else {
    console.log(`  ✗ Failed to refresh ${email}`);
  }
}

writeFileSync('/home/ubuntu/upload/all_gmail_tokens.json', JSON.stringify(tokens, null, 2));
console.log(`\nSaved tokens for: ${Object.keys(tokens).join(', ')}`);
process.exit(0);
