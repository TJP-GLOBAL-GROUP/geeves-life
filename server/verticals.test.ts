/**
 * Verticals Integration Tests
 *
 * Covers four test categories:
 *   1. Data Contract Tests — procedures return the shape the UI expects
 *   2. Feature Completeness Tests — every CRUD operation is reachable and works
 *   3. Schema Alignment Tests — computed fields (calendarCount) match their source of truth
 *   4. Mutation Round-Trip Tests — writes are immediately visible in subsequent reads
 *
 * These tests are designed to catch the class of bugs where:
 *   - A count is computed from the wrong table (Bug: calendarCount from vertical_integrations)
 *   - A backend capability exists but is not surfaced in the UI (Bug: calendar.delete missing)
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
  // Use a large random range to avoid collisions when tests run in parallel
  // Max MySQL INT is 2147483647 — stay well within that
  const id = overrides?.id ?? (Math.floor(Math.random() * 2000000000) + 1);
  const user: AuthenticatedUser = {
    id,
    openId: `test-verticals-${id}`,
    email: `verticals${id}@example.com`,
    name: `Verticals Test User ${id}`,
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

/** Helper: create a household and return the caller + householdId + memberId */
async function setupHousehold() {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);
  const { householdId, memberId } = await caller.household.create({
    name: `Verticals Test Household ${Date.now()}`,
    timezone: "America/New_York",
  });
  registerTestHousehold(householdId);
  return { ctx, caller, householdId, memberId };
}

// ─── Data Contract Tests ─────────────────────────────────────────────────────

describe("Verticals — Data Contract Tests", () => {
  it("verticals.list returns an array (empty for new household)", async () => {
    const { caller } = await setupHousehold();
    const result = await caller.verticals.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("verticals.list items include all fields the UI depends on", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.create({ name: "Home & Family", color: "#E8624A" });
    const result = await caller.verticals.list();
    expect(result.length).toBeGreaterThanOrEqual(1);
    const v = result[0];
    // Shape assertions — every field the Verticals page renders
    expect(v).toHaveProperty("id");
    expect(v).toHaveProperty("name");
    expect(v).toHaveProperty("color");
    expect(v).toHaveProperty("ownerCount");
    expect(v).toHaveProperty("integrationCount");
    expect(v).toHaveProperty("calendarCount");
    expect(v).toHaveProperty("calendars");
    expect(typeof v.calendarCount).toBe("number");
    expect(Array.isArray(v.calendars)).toBe(true);
  });

  it("calendarCount equals calendars.length — they must be consistent", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.create({ name: "Consistency Check", color: "#4F7EC4" });
    const result = await caller.verticals.list();
    for (const v of result) {
      expect(v.calendarCount).toBe(v.calendars.length);
    }
  });
});

// ─── Feature Completeness Tests ──────────────────────────────────────────────

describe("Verticals — Feature Completeness Tests", () => {
  it("verticals.create creates a vertical and it appears in list", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({
      name: "Maxfield Bakery",
      color: "#D4A017",
      description: "Bakery business operations",
      icon: "briefcase",
    });
    expect(created).toBeDefined();
    expect(typeof created === "string" || typeof created === "object").toBe(true);

    const list = await caller.verticals.list();
    const found = list.find((v: any) => v.name === "Maxfield Bakery");
    expect(found).toBeDefined();
    expect(found?.color).toBe("#D4A017");
  });

  it("verticals.update changes name and color", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({ name: "Old Name", color: "#aaaaaa" });
    const id = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    await caller.verticals.update({ id, name: "New Name", color: "#2AAFA9" });

    const list = await caller.verticals.list();
    const updated = list.find((v: any) => v.id === id);
    expect(updated?.name).toBe("New Name");
    expect(updated?.color).toBe("#2AAFA9");
  });

  it("verticals.delete removes the vertical from list", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({ name: "To Delete", color: "#ff0000" });
    const id = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    await caller.verticals.delete({ id });

    const list = await caller.verticals.list();
    const found = list.find((v: any) => v.id === id);
    expect(found).toBeUndefined();
  });

  it("verticals.get returns full vertical details including owners and integrations", async () => {
    const { caller } = await setupHousehold();
    const created = await caller.verticals.create({ name: "Detail Test", color: "#8B5CF6" });
    const id = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    const detail = await caller.verticals.get({ id });
    expect(detail).toBeDefined();
    expect(detail.id).toBe(id);
    expect(detail).toHaveProperty("owners");
    expect(detail).toHaveProperty("integrations");
    expect(detail).toHaveProperty("visibility");
    expect(Array.isArray(detail.owners)).toBe(true);
  });
});

// ─── Schema Alignment Tests ──────────────────────────────────────────────────

describe("Verticals — Schema Alignment Tests (calendarCount source of truth)", () => {
  it("calendarCount is 0 for a new vertical with no assigned calendars", async () => {
    const { caller } = await setupHousehold();
    await caller.verticals.create({ name: "Empty Vertical", color: "#E8943A" });
    const list = await caller.verticals.list();
    const v = list.find((x: any) => x.name === "Empty Vertical");
    expect(v?.calendarCount).toBe(0);
    expect(v?.calendars).toHaveLength(0);
  });

  it("calendarCount reflects calendars.verticalId assignment, not vertical_integrations", async () => {
    const { caller, memberId, householdId } = await setupHousehold();

    // Create a vertical
    const created = await caller.verticals.create({ name: "Calendar Test Vertical", color: "#2AAFA9" });
    const verticalId = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    // Directly assign a calendar via the calendar.update procedure (as the Settings UI does)
    // First create a calendar via the calendar router
    const calCreated = await caller.calendar.create({
      name: "Test Calendar",
      provider: "google_personal",
      externalId: `ext-${Date.now()}`,
      accountEmail: "test@example.com",
    });
    const calendarId = calCreated.id;

    // Assign the calendar to the vertical (this updates calendars.verticalId)
    await caller.calendar.update({ id: calendarId, verticalId });

    // Read back via verticals.list — calendarCount MUST reflect the assignment
    const list = await caller.verticals.list();
    const v = list.find((x: any) => x.id === verticalId);

    expect(v?.calendarCount).toBe(1);
    expect(v?.calendars).toHaveLength(1);
    expect(v?.calendars[0].id).toBe(calendarId);
  });
});

// ─── Mutation Round-Trip Tests ───────────────────────────────────────────────

describe("Verticals — Mutation Round-Trip Tests", () => {
  it("assigning a calendar to a vertical is immediately visible in verticals.list", async () => {
    const { caller } = await setupHousehold();

    const created = await caller.verticals.create({ name: "Round-Trip Vertical", color: "#4F7EC4" });
    const verticalId = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    const calCreated = await caller.calendar.create({
      name: "Round-Trip Calendar",
      provider: "google_personal",
      externalId: `ext-rt-${Date.now()}`,
      accountEmail: "roundtrip@example.com",
    });
    const calendarId = calCreated.id;

    // Before assignment
    const before = await caller.verticals.list();
    const vBefore = before.find((x: any) => x.id === verticalId);
    expect(vBefore?.calendarCount).toBe(0);

    // Assign
    await caller.calendar.update({ id: calendarId, verticalId });

    // After assignment — must be immediately reflected
    const after = await caller.verticals.list();
    const vAfter = after.find((x: any) => x.id === verticalId);
    expect(vAfter?.calendarCount).toBe(1);
    expect(vAfter?.calendars[0].id).toBe(calendarId);
  });

  it("unassigning a calendar from a vertical reduces calendarCount to 0", async () => {
    const { caller } = await setupHousehold();

    const created = await caller.verticals.create({ name: "Unassign Test", color: "#E8624A" });
    const verticalId = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    const calCreated = await caller.calendar.create({
      name: "Unassign Calendar",
      provider: "google_personal",
      externalId: `ext-ua-${Date.now()}`,
      accountEmail: "unassign@example.com",
    });
    const calendarId = calCreated.id;

    // Assign then unassign
    await caller.calendar.update({ id: calendarId, verticalId });
    await caller.calendar.update({ id: calendarId, verticalId: null });

    const list = await caller.verticals.list();
    const v = list.find((x: any) => x.id === verticalId);
    expect(v?.calendarCount).toBe(0);
    expect(v?.calendars).toHaveLength(0);
  });

  it("deleting a calendar removes it from the vertical's calendar list", async () => {
    const { caller } = await setupHousehold();

    const created = await caller.verticals.create({ name: "Delete Calendar Test", color: "#8B5CF6" });
    const verticalId = typeof created === "string" ? created : (created as any).id ?? (created as any).verticalId;

    const calCreated = await caller.calendar.create({
      name: "Calendar To Delete",
      provider: "google_personal",
      externalId: `ext-del-${Date.now()}`,
      accountEmail: "delete@example.com",
    });
    const calendarId = calCreated.id;

    await caller.calendar.update({ id: calendarId, verticalId });

    // Confirm it's assigned
    const before = await caller.verticals.list();
    const vBefore = before.find((x: any) => x.id === verticalId);
    expect(vBefore?.calendarCount).toBe(1);

    // Delete the calendar
    await caller.calendar.delete({ id: calendarId });

    // Vertical should now show 0 calendars
    const after = await caller.verticals.list();
    const vAfter = after.find((x: any) => x.id === verticalId);
    expect(vAfter?.calendarCount).toBe(0);
    expect(vAfter?.calendars).toHaveLength(0);
  });

  it("creating multiple verticals and assigning calendars to each keeps counts independent", async () => {
    const { caller } = await setupHousehold();

    const v1 = await caller.verticals.create({ name: "Vertical A", color: "#2AAFA9" });
    const v2 = await caller.verticals.create({ name: "Vertical B", color: "#D4A017" });
    const id1 = typeof v1 === "string" ? v1 : (v1 as any).id ?? (v1 as any).verticalId;
    const id2 = typeof v2 === "string" ? v2 : (v2 as any).id ?? (v2 as any).verticalId;

    const cal1 = await caller.calendar.create({ name: "Cal A1", provider: "google_personal", externalId: `a1-${Date.now()}`, accountEmail: "a@example.com" });
    const cal2 = await caller.calendar.create({ name: "Cal A2", provider: "google_personal", externalId: `a2-${Date.now()}`, accountEmail: "a@example.com" });
    const cal3 = await caller.calendar.create({ name: "Cal B1", provider: "google_personal", externalId: `b1-${Date.now()}`, accountEmail: "b@example.com" });

    await caller.calendar.update({ id: cal1.id, verticalId: id1 });
    await caller.calendar.update({ id: cal2.id, verticalId: id1 });
    await caller.calendar.update({ id: cal3.id, verticalId: id2 });

    const list = await caller.verticals.list();
    const va = list.find((x: any) => x.id === id1);
    const vb = list.find((x: any) => x.id === id2);

    expect(va?.calendarCount).toBe(2);
    expect(vb?.calendarCount).toBe(1);
    // Counts must equal array lengths
    expect(va?.calendarCount).toBe(va?.calendars.length);
    expect(vb?.calendarCount).toBe(vb?.calendars.length);
  });
});
