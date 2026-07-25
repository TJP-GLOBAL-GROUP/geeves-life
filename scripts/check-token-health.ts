/**
 * check-token-health.ts
 * Checks validity of all OAuth refresh tokens by attempting a silent refresh.
 */
import { createPool } from "mysql2/promise";
import { refreshAccessToken } from "../server/services/googleCalendarSync";

const HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9";

async function main() {
  const conn = await createPool(process.env.DATABASE_URL!).getConnection();

  const [rows] = await conn.execute(
    `SELECT id, accountEmail, provider,
            (accessToken IS NOT NULL) as hasAccess,
            (refreshToken IS NOT NULL) as hasRefresh,
            expiresAt, updatedAt, purposes
     FROM oauth_tokens
     WHERE householdId = ?
     ORDER BY accountEmail`,
    [HOUSEHOLD_ID]
  ) as any[];

  console.log(`\nFound ${rows.length} OAuth tokens\n`);

  for (const row of rows) {
    const purposes = (() => { try { return JSON.parse(row.purposes || "[]"); } catch { return []; } })();
    const expiresIn = row.expiresAt ? Math.round((Number(row.expiresAt) - Date.now()) / 1000) : null;
    console.log(`\n── ${row.accountEmail} (${row.provider})`);
    console.log(`   purposes: ${purposes.join(", ") || "none"}`);
    console.log(`   hasRefreshToken: ${!!row.hasRefresh}`);
    console.log(`   accessToken expires: ${expiresIn !== null ? `${expiresIn}s` : "unknown"}`);

    if (!row.hasRefresh) {
      console.log(`   ❌ NO REFRESH TOKEN — cannot renew without re-auth`);
      continue;
    }

    // Get the actual refresh token
    const [tokenRow] = await conn.execute(
      "SELECT refreshToken FROM oauth_tokens WHERE id = ?",
      [row.id]
    ) as any[];

    try {
      const result = await refreshAccessToken(tokenRow[0].refreshToken) as any;
      const newExpiry = result.expiresIn || result.expires_in;
      console.log(`   ✅ VALID — refreshed successfully, new token expires in ${newExpiry}s`);

      // Update the stored access token
      await conn.execute(
        "UPDATE oauth_tokens SET accessToken = ?, expiresAt = ? WHERE id = ?",
        [result.accessToken || result.access_token, Date.now() + (newExpiry * 1000), row.id]
      );
      console.log(`   ✓ Access token updated in DB`);
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes("invalid_grant") || msg.includes("expired") || msg.includes("revoked")) {
        console.log(`   ❌ EXPIRED/REVOKED — must re-authenticate`);
      } else {
        console.log(`   ⚠ UNKNOWN ERROR: ${msg}`);
      }
    }
  }

  conn.release();
  console.log("\n── Done ──");
}

main().catch(console.error);
