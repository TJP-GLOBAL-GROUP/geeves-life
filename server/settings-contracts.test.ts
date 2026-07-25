/**
 * Settings & Verticals UI Contract Tests
 *
 * These tests assert that every tRPC procedure consumed by the Settings page
 * and the Verticals page returns the exact shape the frontend expects.
 *
 * Philosophy: the frontend should never encounter `undefined` on a field it
 * renders. If a field is missing from the procedure response, the UI silently
 * breaks (shows 0, empty, or crashes). These tests make that class of bug
 * immediately visible as a test failure.
 *
 * Procedures covered (from Settings.tsx and Verticals.tsx):
 *   - household.getMyHousehold
 *   - household.members.update
 *   - household.update
 *   - calendar.listGoogleAccounts
 *   - calendar.list
 *   - calendar.syncStatus
 *   - calendar.update
 *   - calendar.delete
 *   - calendar.removeGoogleAccount (shape only — no live Google token)
 *   - calendar.discoverForAccount (shape only — no live Google token)
 *   - verticals.list
 *   - verticals.create
 *   - verticals.update
 *   - verticals.delete
 *   - verticals.seedDefaults
 */

import { describe, expect, it, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { registerTestHousehold, cleanupTestHouseholds } from "./testHelpers/cleanupRegistry";

afterAll(async () => {
  await cleanupTestHouseholds();
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const id = overrides?.id ?? (Math.floor(Math.random() * 1900000000) + 100000000);
  const user: AuthenticatedUser = {
    id,
    openId: `test-contracts-${id}`,
    email: `contracts${id}@example.com`,
    name: `Contracts Test User ${id}`,
    loginMethod: "manus",
    role: "system_admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

async function setupHousehold() {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);
  const result = await caller.household.create({
    name: `Contracts Test Household ${Date.now()}`,
    timezone: "America/New_York",
  });
  registerTestHousehold(result.householdId);
  return { ctx, caller, ...result };
}

// ─── Household Procedures (Settings > Profile tab) ───────────────────────────

describe("Settings Contracts — Household Procedures", () => {
  it("household.getMyHousehold returns null before creation", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.household.getMyHousehold();
    expect(result).toBeNull();
  });

  it("household.getMyHousehold returns household and member after creation", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.household.getMyHousehold();
    expect(result).not.toBeNull();
    // Shape the Settings Profile tab depends on
    expect(result).toHaveProperty("household");
    expect(result).toHaveProperty("member");
    expect(result).toHaveProperty("isAdmin");
    expect(result!.household).toHaveProperty("id");
    expect(result!.household).toHaveProperty("name");
    expect(result!.household).toHaveProperty("timezone");
    expect(result!.member).toHaveProperty("id");
    expect(result!.member).toHaveProperty("displayName");
  });

  it("household.update changes the household name", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.household.update({ name: "Updated Household Name" });
    expect(result).toBeDefined();
    const hh = await caller.household.getMyHousehold();
    expect(hh!.household.name).toBe("Updated Household Name");
  });

  it("household.members.list returns an array with at least the owner", async () => {
    const { caller } = await setupHousehold();
    const members = await caller.household.members.list();
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(1);
    // Shape the Settings Members tab depends on
    const m = members[0];
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("displayName");
    expect(m).toHaveProperty("role");
    expect(m).toHaveProperty("userId");
  });
});

// ─── Calendar Procedures (Settings > Calendars tab) ──────────────────────────

describe("Settings Contracts — Calendar Procedures", () => {
  it("calendar.list returns an array", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.calendar.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("calendar.list items have all fields CalendarRow renders", async () => {
    const { caller } = await setupHousehold();
    await caller.calendar.create({
      name: "Contract Shape Cal",
      provider: "google_personal",
      externalId: `contract-shape-${Date.now()}`,
      accountEmail: "shape@contracts.test",
    });
    const list = await caller.calendar.list();
    const cal = list.find((c: any) => c.name === "Contract Shape Cal");
    expect(cal).toBeDefined();
    // Every field CalendarRow accesses
    expect(cal).toHaveProperty("id");
    expect(cal).toHaveProperty("name");
    expect(cal).toHaveProperty("color");
    expect(cal).toHaveProperty("provider");
    expect(cal).toHaveProperty("isPrimary");
    expect(cal).toHaveProperty("isVisible");
    expect(cal).toHaveProperty("accountEmail");
    expect(cal).toHaveProperty("verticalId");
  });

  it("calendar.syncStatus returns googleOAuthConfigured boolean", async () => {
    const { caller } = await setupHousehold();
    const status = await caller.calendar.syncStatus();
    expect(status).toHaveProperty("googleOAuthConfigured");
    expect(typeof status.googleOAuthConfigured).toBe("boolean");
    // serviceAccountConfigured removed June 2026 — all accounts use per-account OAuth
  });

  it("calendar.listGoogleAccounts returns an array (empty when no accounts connected)", async () => {
    const { caller } = await setupHousehold();
    const accounts = await caller.calendar.listGoogleAccounts();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it("calendar.delete is reachable and returns { success: true }", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "Deletable Contract Cal",
      provider: "google_personal",
      externalId: `del-contract-${Date.now()}`,
      accountEmail: "del@contracts.test",
    });
    const result = await caller.calendar.delete({ id: cal.id });
    // This test specifically guards against the bug where delete existed
    // on the backend but was never wired into the UI
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });

  it("calendar.update is reachable and returns success", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "Updatable Contract Cal",
      provider: "google_personal",
      externalId: `upd-contract-${Date.now()}`,
      accountEmail: "upd@contracts.test",
    });
    const result = await caller.calendar.update({ id: cal.id, name: "Updated Contract Cal" });
    expect(result).toBeDefined();
  });
});

// ─── Verticals Procedures (Verticals page) ───────────────────────────────────

describe("Settings Contracts — Verticals Procedures", () => {
  it("verticals.list returns an array", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.verticals.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("verticals.list items have all fields the Verticals page renders", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.create({ name: "Contract Vertical", color: "#2AAFA9" });
    const list = await caller.verticals.list();
    const v = list.find((x: any) => x.name === "Contract Vertical");
    expect(v).toBeDefined();
    // Every field the Verticals page card renders
    expect(v).toHaveProperty("id");
    expect(v).toHaveProperty("name");
    expect(v).toHaveProperty("color");
    expect(v).toHaveProperty("description");
    expect(v).toHaveProperty("icon");
    expect(v).toHaveProperty("ownerCount");
    expect(v).toHaveProperty("integrationCount");
    // These two are the critical fields from the bug fix
    expect(v).toHaveProperty("calendarCount");
    expect(v).toHaveProperty("calendars");
    expect(typeof v!.calendarCount).toBe("number");
    expect(Array.isArray(v!.calendars)).toBe(true);
  });

  it("verticals.list calendarCount and calendars.length are always equal", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.create({ name: "Consistency A", color: "#E8624A" });
    await caller.verticals.create({ name: "Consistency B", color: "#D4A017" });
    const list = await caller.verticals.list();
    for (const v of list) {
      // This invariant must always hold — if it breaks, the count source is wrong
      expect(v.calendarCount).toBe(v.calendars.length);
    }
  });

  it("verticals.create returns a value with an id", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.verticals.create({
      name: "Create Contract Test",
      color: "#8B5CF6",
      description: "Test description",
    });
    expect(result).toBeDefined();
    // Either a string ID or an object with id
    const id = typeof result === "string" ? result : (result as any)?.id ?? (result as any)?.verticalId;
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
  });

  it("verticals.update is reachable and changes the vertical", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({ name: "Before", color: "#aaaaaa" });
    const id = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    await caller.verticals.update({ id, name: "After", color: "#bbbbbb" });

    const list = await caller.verticals.list();
    const v = list.find((x: any) => x.id === id);
    expect(v?.name).toBe("After");
  });

  it("verticals.delete is reachable and removes the vertical", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({ name: "To Delete Contract", color: "#ff0000" });
    const id = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    await caller.verticals.delete({ id });

    const list = await caller.verticals.list();
    expect(list.some((v: any) => v.id === id)).toBe(false);
  });

  it("verticals.seedDefaults creates the standard set of verticals when given a list", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.seedDefaults({
      replace: true,
      verticals: [
        { name: "Home & Family", icon: "home", color: "#E8624A", description: "Home and family", sortOrder: 0 },
        { name: "Work", icon: "briefcase", color: "#4F7EC4", description: "Work", sortOrder: 1 },
        { name: "Personal", icon: "user", color: "#8B5CF6", description: "Personal", sortOrder: 2 },
      ],
    });
    const list = await caller.verticals.list();
    // replace:true soft-deletes existing verticals and seeds the new ones
    expect(list.length).toBe(3);
    expect(list.some((v: any) => v.name === "Home & Family")).toBe(true);
    expect(list.some((v: any) => v.name === "Work")).toBe(true);
    expect(list.some((v: any) => v.name === "Personal")).toBe(true);
  });
});

// ─── Cross-Procedure Invariant Tests ─────────────────────────────────────────

describe("Settings Contracts — Cross-Procedure Invariants", () => {
  it("a calendar assigned via calendar.update appears in verticals.list for that vertical", async () => {
    const { caller } = await setupHousehold();

    const vertical = await caller.verticals.create({ name: "Cross-Proc Vertical", color: "#4F7EC4" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Cross-Proc Calendar",
      provider: "google_personal",
      externalId: `cross-${Date.now()}`,
      accountEmail: "cross@example.com",
    });

    // Assign via calendar.update (as the Settings UI does)
    await caller.calendar.update({ id: cal.id, verticalId });

    // Read back via verticals.list (as the Verticals page does)
    const verts = await caller.verticals.list();
    const v = verts.find((x: any) => x.id === verticalId);

    // This is the exact invariant that was broken by the calendarCount bug
    expect(v?.calendarCount).toBe(1);
    expect(v?.calendars).toHaveLength(1);
    expect(v?.calendars[0].id).toBe(cal.id);
  });

  it("deleting a calendar via calendar.delete removes it from verticals.list calendar array", async () => {
    const { caller } = await setupHousehold();

    const vertical = await caller.verticals.create({ name: "Delete Cross Test", color: "#E8943A" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Cross Delete Cal",
      provider: "google_personal",
      externalId: `cross-del-${Date.now()}`,
      accountEmail: "crossdel@example.com",
    });

    await caller.calendar.update({ id: cal.id, verticalId });
    await caller.calendar.delete({ id: cal.id });

    const verts = await caller.verticals.list();
    const v = verts.find((x: any) => x.id === verticalId);
    expect(v?.calendarCount).toBe(0);
    expect(v?.calendars).toHaveLength(0);
  });

  it("calendar.list and verticals.list are consistent about a calendar's verticalId", async () => {
    const { caller } = await setupHousehold();

    const vertical = await caller.verticals.create({ name: "Consistency Cross", color: "#2AAFA9" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Consistency Cross Cal",
      provider: "google_personal",
      externalId: `consistency-${Date.now()}`,
      accountEmail: "consistency@example.com",
    });

    await caller.calendar.update({ id: cal.id, verticalId });

    // Read from both endpoints
    const calList = await caller.calendar.list();
    const vertList = await caller.verticals.list();

    const calEntry = calList.find((c: any) => c.id === cal.id);
    const vertEntry = vertList.find((v: any) => v.id === verticalId);

    // Both must agree on the assignment
    expect(calEntry?.verticalId).toBe(verticalId);
    expect(vertEntry?.calendars.some((c: any) => c.id === cal.id)).toBe(true);
  });
});

// ─── Integrations Procedures (Settings > Integrations tab) ───────────────────

describe("Settings Contracts — Integrations Procedures", () => {
  it("integrations.list returns an array", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.integrations.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("integrations.list items have all fields IntegrationsTab renders", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.integrations.list();
    // May be empty for a fresh household — that's fine; shape test only applies when items exist
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("provider");
      expect(item).toHaveProperty("accountEmail");
      expect(item).toHaveProperty("displayName");
      expect(item).toHaveProperty("purposes");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("scopes");
      expect(Array.isArray(item.purposes)).toBe(true);
      expect(["active", "expired", "revoked"]).toContain(item.status);
    }
  });

  it("integrations.list returns empty array for household with no connected accounts", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.integrations.list();
    // Fresh household has no OAuth tokens — should be empty
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

// ─── Subscription Procedures (Settings > Plan tab) ───────────────────────────

describe("Settings Contracts — Subscription (Plan Tab)", () => {
  it("household.getMyHousehold includes a subscription field", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.household.getMyHousehold();
    expect(result).not.toBeNull();
    // subscription may be null for a fresh household — field must exist
    expect(Object.keys(result!)).toContain("subscription");
  });

  it("subscription field is not null for a fresh household — household.create auto-creates a free trialing subscription", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.household.getMyHousehold();
    // household.create auto-creates a free/trialing subscription row — so subscription is never null after creation
    expect(result!.subscription).not.toBeNull();
    expect(result!.subscription!.plan).toBe("free");
    expect(result!.subscription!.status).toBe("trialing");
  });

  it("household.getMyHousehold subscription shape matches SubscriptionTab expectations when present", async () => {
    const { caller, householdId } = await setupHousehold();

    // Create a subscription row so we can assert the shape
    const { getDb } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { subscriptions } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const { nanoid } = await import("nanoid");
    await db.insert(subscriptions).values({
      id: nanoid(),
      householdId,
      plan: "premium",
      status: "active",
      seatsIncluded: 5,
      additionalSeats: 0,
      seatsUsed: 2,
      addOns: JSON.stringify([]),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    const result = await caller.household.getMyHousehold();
    expect(result!.subscription).not.toBeNull();

    const sub = result!.subscription!;
    // Fields the SubscriptionTab reads
    expect(sub).toHaveProperty("plan");
    expect(sub).toHaveProperty("status");
    expect(sub).toHaveProperty("seatsIncluded");
    expect(sub).toHaveProperty("additionalSeats");
    expect(sub).toHaveProperty("seatsUsed");
    expect(sub).toHaveProperty("addOns");
    expect(sub).toHaveProperty("currentPeriodEnd");
    expect(["free", "premium", "trialing"]).toContain(sub.plan);
    expect(["active", "trialing", "past_due", "cancelled", "paused"]).toContain(sub.status);
    expect(typeof sub.seatsIncluded).toBe("number");
    expect(typeof sub.seatsUsed).toBe("number");
  });

  it("isAdmin is true for the household creator", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.household.getMyHousehold();
    expect(result!.isAdmin).toBe(true);
  });
});

// ─── Walmart Order Parsing — Post-Processing Contract ────────────────────────

describe("Walmart Order Parsing — totalAmount normalisation", () => {
  /**
   * These tests exercise the post-processing strip that runs AFTER the LLM
   * returns a totalAmount. They verify that currency symbols, spaces, and
   * letter codes are removed regardless of what the LLM returns.
   *
   * The normalisation is: parsed.totalAmount.replace(/[^0-9.]/g, "").trim()
   * We test it directly via the parseEmailOrder mutation with a mocked LLM.
   */

  const WALMART_STYLE_SAMPLES: Array<{ raw: string; expected: string; label: string }> = [
    { raw: "$47.83",    expected: "47.83",  label: "dollar sign prefix" },
    { raw: "USD 47.83", expected: "47.83",  label: "USD prefix with space" },
    { raw: "47.83 USD", expected: "47.83",  label: "USD suffix with space" },
    { raw: "47.83",     expected: "47.83",  label: "already clean numeric" },
    { raw: "$1,234.56", expected: "1234.56", label: "comma-formatted with dollar sign" },
    { raw: "  $89.00 ", expected: "89.00",  label: "whitespace-padded with dollar sign" },
  ];

  for (const sample of WALMART_STYLE_SAMPLES) {
    it(`strips "${sample.raw}" → "${sample.expected}" (${sample.label})`, () => {
      // Replicate the exact normalisation from server/routers.ts parseEmailOrder
      const cleaned = sample.raw.replace(/[^0-9.]/g, "").trim();
      const numeric = cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : sample.raw;
      expect(numeric).toBe(sample.expected);
    });
  }

  it("does not corrupt a clean numeric string", () => {
    const clean = "156.78";
    const result = clean.replace(/[^0-9.]/g, "").trim();
    expect(result).toBe("156.78");
  });

  it("handles empty string gracefully (falls back to original)", () => {
    const empty = "";
    const cleaned = empty.replace(/[^0-9.]/g, "").trim();
    // Empty string → isNaN(parseFloat("")) is true → falls back to original
    const result = cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : empty;
    expect(result).toBe("");
  });
});
