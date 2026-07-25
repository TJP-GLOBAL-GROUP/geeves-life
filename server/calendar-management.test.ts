/**
 * Calendar Management Integration Tests
 *
 * Covers four test categories:
 *   1. Data Contract Tests — procedures return the shape the UI expects
 *   2. Feature Completeness Tests — every CRUD operation is reachable and works
 *   3. Schema Alignment Tests — calendar fields match what Settings UI renders
 *   4. Mutation Round-Trip Tests — writes are immediately visible in subsequent reads
 *
 * Key regression: calendar.delete exists on the backend but was not surfaced in
 * the Settings UI. These tests ensure the procedure is reachable, works correctly,
 * and that its effects are immediately visible in calendar.list.
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
    openId: `test-cal-mgmt-${id}`,
    email: `calmgmt${id}@example.com`,
    name: `Calendar Test User ${id}`,
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
  const { householdId, memberId } = await caller.household.create({
    name: `Cal Mgmt Test Household ${Date.now()}`,
    timezone: "America/New_York",
  });
  registerTestHousehold(householdId);
  return { ctx, caller, householdId, memberId };
}

// ─── Data Contract Tests ─────────────────────────────────────────────────────

describe("Calendar Management — Data Contract Tests", () => {
  it("calendar.list returns an array", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.calendar.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("calendar.list items include all fields the Settings UI depends on", async () => {
    const { caller } = await setupHousehold();
    await caller.calendar.create({
      name: "Shape Test Calendar",
      provider: "google_personal",
      externalId: `shape-${Date.now()}`,
      accountEmail: "shape@example.com",
    });
    const list = await caller.calendar.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const cal = list[0];
    // All fields rendered in CalendarRow component
    expect(cal).toHaveProperty("id");
    expect(cal).toHaveProperty("name");
    expect(cal).toHaveProperty("color");
    expect(cal).toHaveProperty("provider");
    expect(cal).toHaveProperty("isPrimary");
    expect(cal).toHaveProperty("isVisible");
    expect(cal).toHaveProperty("accountEmail");
    expect(cal).toHaveProperty("verticalId");
    expect(typeof cal.id).toBe("string");
    expect(typeof cal.name).toBe("string");
  });

  it("calendar.syncStatus returns configuration flags the UI uses", async () => {
    const { caller } = await setupHousehold();
    const status = await caller.calendar.syncStatus();
    expect(status).toHaveProperty("googleOAuthConfigured");
    expect(typeof status.googleOAuthConfigured).toBe("boolean");
    // serviceAccountConfigured was removed in June 2026 — all accounts use OAuth
  });
});

// ─── Feature Completeness Tests ──────────────────────────────────────────────

describe("Calendar Management — Feature Completeness Tests", () => {
  it("calendar.create creates a calendar and it appears in list", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "My Work Calendar",
      provider: "google_personal",  // google_workspace deprecated June 2026
      externalId: `work-${Date.now()}`,
      accountEmail: "work@maxfieldbakery.com",
      color: "#4285f4",
    });
    expect(cal).toBeDefined();
    expect(cal.id).toBeDefined();
    expect(typeof cal.id).toBe("string");

    const list = await caller.calendar.list();
    const found = list.find((c: any) => c.id === cal.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe("My Work Calendar");
  });

  it("calendar.update changes name, color, and isVisible", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "Before Update",
      provider: "google_personal",
      externalId: `upd-${Date.now()}`,
      accountEmail: "update@example.com",
    });

    await caller.calendar.update({
      id: cal.id,
      name: "After Update",
      color: "#ff5733",
      isVisible: false,
    });

    const list = await caller.calendar.list();
    const updated = list.find((c: any) => c.id === cal.id);
    expect(updated?.name).toBe("After Update");
    expect(updated?.color).toBe("#ff5733");
    expect(updated?.isVisible).toBe(false);
  });

  it("calendar.delete removes the calendar from list (Feature Completeness: delete must be reachable)", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "Calendar To Delete",
      provider: "google_personal",
      externalId: `del-${Date.now()}`,
      accountEmail: "delete@example.com",
    });

    // Confirm it exists
    const before = await caller.calendar.list();
    expect(before.some((c: any) => c.id === cal.id)).toBe(true);

    // Delete it
    const result = await caller.calendar.delete({ id: cal.id });
    expect(result.success).toBe(true);

    // Confirm it's gone
    const after = await caller.calendar.list();
    expect(after.some((c: any) => c.id === cal.id)).toBe(false);
  });

  it("calendar.update with verticalId assigns the calendar to a vertical", async () => {
    const { caller } = await setupHousehold();
    const vertical = await caller.verticals.create({ name: "Assignment Test", color: "#2AAFA9" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Assignable Calendar",
      provider: "google_personal",
      externalId: `assign-${Date.now()}`,
      accountEmail: "assign@example.com",
    });

    // Assign
    await caller.calendar.update({ id: cal.id, verticalId });

    const list = await caller.calendar.list();
    const updated = list.find((c: any) => c.id === cal.id);
    expect(updated?.verticalId).toBe(verticalId);
  });

  it("calendar.update with verticalId: null unassigns the calendar", async () => {
    const { caller } = await setupHousehold();
    const vertical = await caller.verticals.create({ name: "Unassign Test V", color: "#E8624A" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Unassignable Calendar",
      provider: "google_personal",
      externalId: `unassign-${Date.now()}`,
      accountEmail: "unassign@example.com",
    });

    await caller.calendar.update({ id: cal.id, verticalId });
    await caller.calendar.update({ id: cal.id, verticalId: null });

    const list = await caller.calendar.list();
    const updated = list.find((c: any) => c.id === cal.id);
    expect(updated?.verticalId).toBeNull();
  });

  it("calendar.listGoogleAccounts returns an array", async () => {
    const { caller } = await setupHousehold();
    const accounts = await caller.calendar.listGoogleAccounts();
    expect(Array.isArray(accounts)).toBe(true);
  });
});

// ─── Schema Alignment Tests ──────────────────────────────────────────────────

describe("Calendar Management — Schema Alignment Tests", () => {
  it("calendar created with accountEmail has accountEmail in list response", async () => {
    const { caller } = await setupHousehold();
    const email = `schema-test-${Date.now()}@example.com`;
    const cal = await caller.calendar.create({
      name: "Schema Alignment Cal",
      provider: "google_personal",
      externalId: `schema-${Date.now()}`,
      accountEmail: email,
    });

    const list = await caller.calendar.list();
    const found = list.find((c: any) => c.id === cal.id);
    expect(found?.accountEmail).toBe(email);
  });

  it("calendar created without verticalId has verticalId as null in list response", async () => {
    const { caller } = await setupHousehold();
    const cal = await caller.calendar.create({
      name: "No Vertical Cal",
      provider: "google_personal",
      externalId: `nv-${Date.now()}`,
      accountEmail: "novertical@example.com",
    });

    const list = await caller.calendar.list();
    const found = list.find((c: any) => c.id === cal.id);
    expect(found?.verticalId === null || found?.verticalId === undefined).toBe(true);
  });

  it("calendar.create with verticalId immediately shows verticalId in list", async () => {
    const { caller } = await setupHousehold();
    const vertical = await caller.verticals.create({ name: "Inline Assign", color: "#D4A017" });
    const verticalId = typeof vertical === "string" ? vertical : (vertical as any).id ?? (vertical as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Pre-assigned Calendar",
      provider: "google_personal",
      externalId: `preassign-${Date.now()}`,
      accountEmail: "preassign@example.com",
      verticalId,
    });

    const list = await caller.calendar.list();
    const found = list.find((c: any) => c.id === cal.id);
    expect(found?.verticalId).toBe(verticalId);
  });
});

// ─── Mutation Round-Trip Tests ───────────────────────────────────────────────

describe("Calendar Management — Mutation Round-Trip Tests", () => {
  it("create → list → update → list shows consistent state at each step", async () => {
    const { caller } = await setupHousehold();

    // Create
    const cal = await caller.calendar.create({
      name: "Round Trip Cal",
      provider: "google_personal",
      externalId: `rt-${Date.now()}`,
      accountEmail: "rt@example.com",
      color: "#aabbcc",
    });

    // List after create
    const afterCreate = await caller.calendar.list();
    const step1 = afterCreate.find((c: any) => c.id === cal.id);
    expect(step1?.name).toBe("Round Trip Cal");
    expect(step1?.color).toBe("#aabbcc");

    // Update
    await caller.calendar.update({ id: cal.id, name: "Updated Round Trip", color: "#112233" });

    // List after update
    const afterUpdate = await caller.calendar.list();
    const step2 = afterUpdate.find((c: any) => c.id === cal.id);
    expect(step2?.name).toBe("Updated Round Trip");
    expect(step2?.color).toBe("#112233");
  });

  it("create → delete → list shows calendar is gone", async () => {
    const { caller } = await setupHousehold();

    const cal = await caller.calendar.create({
      name: "Delete Round Trip",
      provider: "google_personal",
      externalId: `drt-${Date.now()}`,
      accountEmail: "drt@example.com",
    });

    await caller.calendar.delete({ id: cal.id });

    const list = await caller.calendar.list();
    expect(list.some((c: any) => c.id === cal.id)).toBe(false);
  });

  it("assigning then reassigning a calendar to a different vertical updates verticalId correctly", async () => {
    const { caller } = await setupHousehold();

    const v1 = await caller.verticals.create({ name: "Vertical X", color: "#2AAFA9" });
    const v2 = await caller.verticals.create({ name: "Vertical Y", color: "#8B5CF6" });
    const id1 = typeof v1 === "string" ? v1 : (v1 as any).id ?? (v1 as any).verticalId;
    const id2 = typeof v2 === "string" ? v2 : (v2 as any).id ?? (v2 as any).verticalId;

    const cal = await caller.calendar.create({
      name: "Reassignable Cal",
      provider: "google_personal",
      externalId: `reassign-${Date.now()}`,
      accountEmail: "reassign@example.com",
    });

    // Assign to v1
    await caller.calendar.update({ id: cal.id, verticalId: id1 });
    const list1 = await caller.calendar.list();
    expect(list1.find((c: any) => c.id === cal.id)?.verticalId).toBe(id1);

    // Reassign to v2
    await caller.calendar.update({ id: cal.id, verticalId: id2 });
    const list2 = await caller.calendar.list();
    expect(list2.find((c: any) => c.id === cal.id)?.verticalId).toBe(id2);

    // Also verify in verticals.list
    const verts = await caller.verticals.list();
    const va = verts.find((v: any) => v.id === id1);
    const vb = verts.find((v: any) => v.id === id2);
    expect(va?.calendarCount).toBe(0);
    expect(vb?.calendarCount).toBe(1);
  });
});
