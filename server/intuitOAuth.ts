/**
 * Intuit QuickBooks Online OAuth 2.0 Flow
 *
 * Models the Google OAuth pattern (googleOAuth.ts / googleAccountConnect.ts)
 * for QuickBooks Online connections.
 *
 * Purposes:
 *   qbo_read  → Read Chart of Accounts, transactions, reports, classes,
 *               customers, vendors (scope: com.intuit.quickbooks.accounting)
 *   qbo_write → Write transactions, create journal entries, push expenses
 *               (scope: com.intuit.quickbooks.accounting)
 *
 * QBO tokens are stored in the oauth_tokens table with provider="intuit" and
 * accountEmail set to the realmId (since QBO identifies by realm, not email).
 *
 * GCP Secret Manager:
 *   QBO_CLIENT_ID     → Intuit app client ID
 *   QBO_CLIENT_SECRET → Intuit app client secret
 *   QBO_WEBHOOK_TOKEN → Intuit webhook verifier token
 */

import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { registerNonce, verifyAndConsumeNonce } from "./nonceStore";
import * as db from "../db";
import { sdk } from "../_core/sdk";
import { decryptToken } from "../tokenEncryption";

const INTUIT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QBO_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const REFRESH_WINDOW_MS = 45 * 60 * 1000;

export type QBOPurpose = "qbo_read" | "qbo_write";
export const QBO_PURPOSES: QBOPurpose[] = ["qbo_read", "qbo_write"];

class IntuitAuthProvider {
  constructor(private clientId: string, private clientSecret: string) {}

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId, redirect_uri: redirectUri,
      response_type: "code",
      scope: ["openid", "email", "profile", QBO_SCOPE].join(" "),
      state,
    });
    return `${INTUIT_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(INTUIT_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    if (!res.ok) throw new Error(`Intuit token exchange failed (${res.status}): ${await res.text()}`);
    const d = await res.json();
    return { accessToken: d.access_token, refreshToken: d.refresh_token ?? null, expiresIn: d.expires_in, scope: d.scope ?? QBO_SCOPE, realmId: d.realmId ?? "" };
  }

  async refreshAccessToken(refreshToken: string) {
    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(INTUIT_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error(`Intuit refresh failed (${res.status}): ${await res.text()}`);
    const d = await res.json();
    return { accessToken: d.access_token, refreshToken: d.refresh_token ?? null, expiresIn: d.expires_in, expiresAt: Date.now() + d.expires_in * 1000 };
  }

  async revokeToken(refreshToken: string) {
    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    await fetch(INTUIT_REVOKE_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  }
}

let _provider: IntuitAuthProvider | null = null;
function getProvider(): IntuitAuthProvider | null {
  if (_provider) return _provider;
  const cid = process.env.QBO_CLIENT_ID;
  const csec = process.env.QBO_CLIENT_SECRET;
  if (!cid || !csec) { console.log("[QBO Auth] QBO_CLIENT_ID or QBO_CLIENT_SECRET missing"); return null; }
  _provider = new IntuitAuthProvider(cid, csec);
  return _provider;
}

function generateNonce(): string { return randomBytes(16).toString("hex"); }

export function setupIntuitOAuth(app: Express) {
  const provider = getProvider();
  if (!provider) return;

  app.get("/api/auth/intuit/connect", async (req, res) => {
    try { await sdk.authenticateRequest(req); } catch { return res.status(401).send("Login required"); }
    const origin = req.query.origin as string || `${req.protocol}://${req.get("host")}`;
    const returnPath = req.query.returnPath as string || "/settings?tab=integrations";
    const purposes = (req.query.purposes as string || "qbo_read").split(",").filter((p): p is QBOPurpose => QBO_PURPOSES.includes(p as QBOPurpose));
    const nonce = generateNonce();
    await registerNonce(nonce);
    const state = Buffer.from(JSON.stringify({ origin, returnPath, action: "connect_account", purposes, nonce })).toString("base64url");
    res.redirect(provider.getAuthorizationUrl(state, `${origin}/api/auth/intuit/callback`));
  });

  app.get("/api/auth/intuit/callback", async (req, res) => {
    const { code, state, realmId, error: oauthError } = req.query;
    let origin = `${req.protocol}://${req.get("host")}`;
    let returnPath = "/settings?tab=integrations";
    let purposes: QBOPurpose[] = ["qbo_read"];
    let stateNonce: string | null = null;
    try { if (state) { const s = JSON.parse(Buffer.from(state as string, "base64url").toString()); origin = s.origin || origin; returnPath = s.returnPath || returnPath; purposes = s.purposes?.filter((p: string) => QBO_PURPOSES.includes(p)) || ["qbo_read"]; stateNonce = s.nonce || null; } } catch { /* ignore */ }
    if (stateNonce && !(await verifyAndConsumeNonce(stateNonce))) { return res.redirect(`${origin}${returnPath}?qbo_connect_error=invalid_state`); }
    if (oauthError) { return res.redirect(`${origin}${returnPath}?qbo_connect_error=${encodeURIComponent(String(oauthError))}`); }
    if (!code) { return res.redirect(`${origin}${returnPath}?qbo_connect_error=missing_code`); }
    const finalRealmId = (realmId as string) || "";
    if (!finalRealmId) { return res.redirect(`${origin}${returnPath}?qbo_connect_error=missing_realm`); }
    try {
      const user = await sdk.authenticateRequest(req);
      const member = await db.getHouseholdMemberByUserId(user.id);
      if (!member) { return res.redirect(`${origin}${returnPath}?qbo_connect_error=no_household`); }
      const tokens = await provider.exchangeCode(code as string, `${origin}/api/auth/intuit/callback`);
      const now = new Date();
      await db.upsertOAuthToken({
        id: nanoid(), householdId: member.householdId, memberId: member.id,
        provider: "intuit", accountEmail: finalRealmId,
        accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        scopes: tokens.scope, purposes: purposes as string[],
        displayName: `QBO ${finalRealmId}`, status: "active",
        lastRefreshedAt: now, createdAt: now, updatedAt: now,
      });
      res.redirect(`${origin}${returnPath}?qbo_connected=${finalRealmId}`);
    } catch (err: any) {
      console.error("[QBO Auth] Callback error:", err.message);
      res.redirect(`${origin}${returnPath}?qbo_connect_error=${encodeURIComponent(err.message)}`);
    }
  });
}

export async function getValidAccessToken(realmId: string): Promise<string> {
  const dbInstance = await db.getDb();
  if (!dbInstance) throw new Error("Database not available");
  const { oauthTokens } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await dbInstance.select().from(oauthTokens).where(and(eq(oauthTokens.provider, "intuit"), eq(oauthTokens.accountEmail, realmId), eq(oauthTokens.status, "active"))).limit(1);
  if (!rows.length) throw new Error(`No active QBO token for realm ${realmId}`);
  const token = rows[0];
  const accessToken = decryptToken(token.accessToken);
  if (!accessToken) throw new Error(`Cannot decrypt QBO token for realm ${realmId}`);
  if (token.expiresAt && token.expiresAt < Date.now() + REFRESH_WINDOW_MS) {
    if (!token.refreshToken) throw new Error(`No refresh token for realm ${realmId}`);
    const rt = decryptToken(token.refreshToken);
    if (!rt) throw new Error("Cannot decrypt refresh token");
    const provider = getProvider();
    if (!provider) throw new Error("Provider not configured");
    try {
      const r = await provider.refreshAccessToken(rt);
      await dbInstance.update(oauthTokens).set({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? token.refreshToken, expiresAt: r.expiresAt, lastRefreshedAt: new Date(), status: "active", updatedAt: new Date() }).where(eq(oauthTokens.id, token.id));
      return r.accessToken;
    } catch (e: any) {
      await dbInstance.update(oauthTokens).set({ status: "expired", updatedAt: new Date() }).where(eq(oauthTokens.id, token.id));
      throw new Error(`QBO refresh failed for realm ${realmId}: ${e.message}`);
    }
  }
  return accessToken;
}

export async function refreshTokensIfNeeded(realmId: string): Promise<{ refreshed: boolean; accessToken?: string; expiresAt?: number }> {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return { refreshed: false };
    const { oauthTokens } = await import("../drizzle/schema");
    const { and, eq } = await import("drizzle-orm");
    const rows = await dbInstance.select().from(oauthTokens).where(and(eq(oauthTokens.provider, "intuit"), eq(oauthTokens.accountEmail, realmId), eq(oauthTokens.status, "active"))).limit(1);
    if (!rows.length) return { refreshed: false };
    const token = rows[0];
    if (token.expiresAt && token.expiresAt >= Date.now() + REFRESH_WINDOW_MS) return { refreshed: false };
    if (!token.refreshToken) return { refreshed: false };
    const rt = decryptToken(token.refreshToken);
    if (!rt) return { refreshed: false };
    const provider = getProvider();
    if (!provider) return { refreshed: false };
    const r = await provider.refreshAccessToken(rt);
    await dbInstance.update(oauthTokens).set({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? token.refreshToken, expiresAt: r.expiresAt, lastRefreshedAt: new Date(), status: "active", updatedAt: new Date() }).where(eq(oauthTokens.id, token.id));
    return { refreshed: true, accessToken: r.accessToken, expiresAt: r.expiresAt };
  } catch (err: any) {
    console.error(`[QBO Refresh] Failed for ${realmId}:`, err.message);
    return { refreshed: false };
  }
}

export async function disconnectRealm(realmId: string): Promise<void> {
  const dbInstance = await db.getDb();
  if (!dbInstance) return;
  const { oauthTokens } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await dbInstance.select().from(oauthTokens).where(and(eq(oauthTokens.provider, "intuit"), eq(oauthTokens.accountEmail, realmId))).limit(1);
  if (!rows.length) return;
  const token = rows[0];
  if (token.refreshToken) { const rt = decryptToken(token.refreshToken); if (rt) { const p = getProvider(); if (p) try { await p.revokeToken(rt); } catch { /* ignore */ } } }
  await dbInstance.update(oauthTokens).set({ status: "revoked", updatedAt: new Date() }).where(eq(oauthTokens.id, token.id));
}

export async function listConnectedRealms(householdId: string) {
  const dbInstance = await db.getDb();
  if (!dbInstance) return [];
  const { oauthTokens } = await import("../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  return dbInstance.select().from(oauthTokens).where(and(eq(oauthTokens.provider, "intuit"), eq(oauthTokens.householdId, householdId))).orderBy(desc(oauthTokens.createdAt));
}
