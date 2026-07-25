/**
 * AES-256-GCM Token Encryption
 *
 * Encrypts OAuth access/refresh tokens at rest using AES-256-GCM.
 * The encryption key is derived from JWT_SECRET (which is already a
 * strong random secret managed by the platform).
 *
 * Format: base64url(iv[12] || authTag[16] || ciphertext)
 *
 * IMPORTANT: This module is transparent to callers - encrypt before
 * storing, decrypt after reading. The DB columns remain TEXT.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derive a 32-byte key from JWT_SECRET using SHA-256.
 * Throws at startup if JWT_SECRET is not set — the server must never run
 * without token encryption, as OAuth refresh tokens would be stored as
 * effectively plaintext in the database.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[TokenEncryption] FATAL: JWT_SECRET environment variable is not set. " +
      "The server cannot start without a token encryption key. " +
      "Set JWT_SECRET to a strong random secret (min 32 chars) before starting."
    );
  }
  return createHash("sha256").update(secret).digest();
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = getDerivedKey();
  return _key;
}

/**
 * Encrypt a plaintext token string.
 * Returns a base64-encoded string safe for TEXT column storage.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  // Already encrypted (starts with our marker prefix)
  if (plaintext.startsWith("enc:")) return plaintext;

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Prefix "enc:" so we can detect already-encrypted values
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}

/**
 * Decrypt a token that was encrypted with encryptToken.
 * Returns the original plaintext. If the value is not encrypted
 * (legacy plaintext), returns it as-is.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null;
  // Not encrypted (legacy plaintext) - return as-is
  if (!stored.startsWith("enc:")) return stored;

  try {
    const key = getKey();
    const combined = Buffer.from(stored.slice(4), "base64");
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("[TokenEncryption] Decryption failed - returning null:", (err as Error)?.message);
    return null;
  }
}

/**
 * Re-encrypt a plaintext token (for migrating legacy rows).
 * If already encrypted, returns as-is.
 */
export function ensureEncrypted(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (value.startsWith("enc:")) return value;
  return encryptToken(value);
}
