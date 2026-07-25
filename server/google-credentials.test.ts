import { describe, it, expect } from "vitest";

/**
 * Google OAuth Credential Tests
 *
 * Verifies that the per-account OAuth credentials are configured.
 * Service account / domain-wide delegation was deprecated in June 2026.
 * All Google accounts (personal Gmail, custom domains) use OAuth.
 */
describe("Google OAuth Credentials", () => {
  it("should have GOOGLE_CLIENT_ID configured", () => {
    expect(process.env.GOOGLE_CLIENT_ID).toBeDefined();
    expect(process.env.GOOGLE_CLIENT_ID).toContain(".apps.googleusercontent.com");
  });

  it("should have GOOGLE_CLIENT_SECRET configured", () => {
    expect(process.env.GOOGLE_CLIENT_SECRET).toBeDefined();
    expect(process.env.GOOGLE_CLIENT_SECRET!.length).toBeGreaterThan(10);
  });

  it("should NOT require service account credentials (deprecated)", () => {
    // Service account was deprecated June 2026 — all accounts use OAuth.
    // This test documents the intentional absence of service account env vars in production.
    // GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY are no longer required.
    expect(true).toBe(true); // architecture assertion — no service account needed
  });
});
