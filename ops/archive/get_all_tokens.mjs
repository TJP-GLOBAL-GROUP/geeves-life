/**
 * Get valid Gmail access tokens for all connected accounts.
 * Outputs a JSON file with { email: access_token } mapping.
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
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }).toString(),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return await resp.json();
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all active accounts with email_scraping purpose
const [rows] = await conn.execute(
  `SELECT accountEmail, accessToken, refreshToken, expiresAt 
   FROM oauth_tokens 
   WHERE status = 'active' AND purposes LIKE '%email_scraping%'
   ORDER BY updatedAt DESC`
);

await conn.end();

const tokens = {};
const seen = new Set();

for (const row of rows) {
  const email = row.accountEmail;
  if (seen.has(email)) continue;
  seen.add(email);

  try {
    const refreshToken = decryptToken(row.refreshToken);
    const accessToken = decryptToken(row.accessToken);
    const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
    const now = Date.now();

    let finalToken = accessToken;
    if (expiresAt < now || !accessToken) {
      console.log(`  Refreshing token for ${email}...`);
      const refreshed = await refreshAccessToken(refreshToken);
      finalToken = refreshed.access_token;
      if (!finalToken) {
        console.log(`  Failed to refresh token for ${email}: ${JSON.stringify(refreshed)}`);
        continue;
      }
    }

    // Verify token works
    const testResp = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${finalToken}` } }
    );
    if (!testResp.ok) {
      console.log(`  Token invalid for ${email}: ${testResp.status}`);
      continue;
    }
    const profile = await testResp.json();
    console.log(`  ✓ ${email} → ${profile.emailAddress} (${profile.messagesTotal} messages)`);
    tokens[email] = finalToken;
  } catch (err) {
    console.log(`  Error for ${email}: ${err.message}`);
  }
}

writeFileSync('/home/ubuntu/upload/all_gmail_tokens.json', JSON.stringify(tokens, null, 2));
console.log(`\nSaved tokens for ${Object.keys(tokens).length} accounts`);
