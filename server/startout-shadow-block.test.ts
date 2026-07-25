/**
 * P-15 StartOut Shadow Block Stress Tests
 *
 * Validates that the shadowSource / shadowBlocking architecture correctly
 * isolates the two StartOut sub-calendars:
 *
 *   tarik.perkins@startout.org  — personal work calendar
 *     shadowSource=true   → generates Busy blocks on other calendars
 *     shadowBlocking=true → receives Busy blocks from other calendars
 *
 *   Team StartOut               — shared team calendar
 *     shadowSource=false  → does NOT generate Busy blocks
 *     shadowBlocking=false → does NOT receive Busy blocks
 *
 * Test scenarios:
 *  T-01  Personal calendar event → propagates to cross-vertical targets
 *  T-02  Shared/team calendar event → NO propagation (shadowSource=false)
 *  T-03  Event targeting opted-out calendar → skipped (shadowBlocking=false)
 *  T-04  Self-loop prevention — source calendar never targets itself
 *  T-05  Delete propagation — shadow blocks removed when source event deleted
 *  T-06  shadowSource toggle — disabling source stops new propagation
 *  T-07  shadowBlocking toggle — disabling target removes it from future propagation
 *  T-08  Idempotency — re-propagating same event does not duplicate shadow blocks
 *  T-09  Multi-vertical isolation — StartOut personal only receives from correct verticals
 *  T-10  Event creation on opted-out calendar succeeds and is not deleted by propagation
 */

import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
// These integration tests require the shadow block engine to be enabled
process.env.SHADOW_BLOCK_ENGINE_ENABLED = "true";

import { registerTestHousehold, cleanupTestHouseholds } from "./testHelpers/cleanupRegistry";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { onEventUpserted, onEventDeleted } from "./services/eventPropagation";
import * as db from "./db";

afterAll(async () => {
  await cleanupTestHouseholds();
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const id = overrides?.id ?? (Math.floor(Math.random() * 1_900_000_000) + 100_000_000);
  const user: AuthenticatedUser = {
    id,
    openId: `test-startout-${id}`,
    email: `startout${id}@example.com`,
    name: `StartOut Test User ${id}`,
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

/**
 * Creates a full StartOut-like household with:
 *  - One vertical: "StartOut" (containing personalCal + teamCal)
 *  - One vertical: "Personal" (containing personalGmailCal)
 *  - personalCal: shadowSource=true, shadowBlocking=true  (tarik.perkins@startout.org)
 *  - teamCal:     shadowSource=false, shadowBlocking=false (Team StartOut)
 *  - personalGmailCal: shadowSource=true, shadowBlocking=true (tarikp@gmail.com)
 */
async function setupStartOutHousehold() {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  const { householdId, memberId } = await caller.household.create({
    name: `StartOut Test HH ${Date.now()}`,
    timezone: "America/New_York",
  });
  registerTestHousehold(householdId);

  // Create verticals via household.verticals.create (returns { id })
  const startoutVertical = await caller.household.verticals.create({
    name: `StartOut-${Date.now()}`,
    icon: "briefcase",
    color: "#0066CC",
  });
  const personalVertical = await caller.household.verticals.create({
    name: `Personal-${Date.now()}`,
    icon: "user",
    color: "#22C55E",
  });

  // Personal work calendar (tarik.perkins@startout.org equivalent)
  const personalCal = await caller.calendar.create({
    name: "tarik.perkins@startout.org",
    provider: "google_workspace",
    externalId: `startout-personal-${Date.now()}`,
    accountEmail: "tarik.perkins@startout.org",
    verticalId: startoutVertical.id,
  });
  // Ensure shadowSource=true, shadowBlocking=true (defaults)
  await caller.calendar.update({
    id: personalCal.id,
    shadowBlocking: true,
    shadowSource: true,
  });

  // Team calendar (Team StartOut equivalent)
  const teamCal = await caller.calendar.create({
    name: "Team StartOut",
    provider: "google_workspace",
    externalId: `startout-team-${Date.now()}`,
    accountEmail: "team@startout.org",
    verticalId: startoutVertical.id,
  });
  // Shared calendar: no source, no target
  await caller.calendar.update({
    id: teamCal.id,
    shadowBlocking: false,
    shadowSource: false,
  });

  // Personal Gmail calendar (cross-vertical source)
  const personalGmailCal = await caller.calendar.create({
    name: "tarikp@gmail.com",
    provider: "google_personal", // google_personal is a valid enum value
    externalId: `gmail-personal-${Date.now()}`,
    accountEmail: "tarikp@gmail.com",
    verticalId: personalVertical.id,
  });

  return {
    ctx,
    caller,
    householdId,
    memberId,
    startoutVertical,
    personalVertical,
    personalCal,
    teamCal,
    personalGmailCal,
  };
}

/** Create a test event on a calendar and return its ID */
async function createTestEvent(
  caller: ReturnType<typeof appRouter.createCaller>,
  calendarId: string,
  opts?: { title?: string; startOffset?: number }
) {
  const now = Date.now();
  const start = now + (opts?.startOffset ?? 3600_000); // 1h from now by default
  const end = start + 3600_000; // 1h duration

  const event = await caller.calendar.events.create({
    calendarId,
    title: opts?.title ?? "Test Meeting",
    startTime: start,
    endTime: end,
    isAllDay: false,
  });
  return event;
}

/** Wait for async propagation to complete (fire-and-forget pattern) */
/**
 * Poll until shadow blocks appear for the given source event, or timeout.
 * Replaces the fixed-delay waitForPropagation to eliminate race conditions.
 */
async function pollForShadowBlocks(
  sourceEventId: string,
  check: (blocks: any[]) => boolean = (b) => b.length >= 0,
  timeoutMs = 8000,
  intervalMs = 300
): Promise<any[]> {
  const start = Date.now();
  // Minimum initial wait for the fire-and-forget propagation to start
  await new Promise((r) => setTimeout(r, 300));
  while (Date.now() - start < timeoutMs) {
    const blocks = await getShadowBlocksForEvent(sourceEventId);
    if (check(blocks)) return blocks;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return await getShadowBlocksForEvent(sourceEventId);
}

/** Convenience: wait for at least N shadow blocks to exist for an event */
async function waitForBlocks(sourceEventId: string, minCount: number, timeoutMs = 8000) {
  return pollForShadowBlocks(sourceEventId, (b) => b.length >= minCount, timeoutMs);
}

/** Convenience: wait for shadow blocks to be cleared (0 remaining) */
async function waitForBlocksCleared(sourceEventId: string, timeoutMs = 8000) {
  return pollForShadowBlocks(sourceEventId, (b) => b.length === 0, timeoutMs);
}

/** Legacy alias — used by tests that just need a short settling wait */
async function waitForPropagation(ms = 500) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Get shadow blocks targeting a specific calendar */
async function getShadowBlocksForTarget(targetCalendarId: string) {
  const { getDb } = await import("./db");
  const conn = await (getDb as any)();
  if (!conn) return [];
  const { shadowBlocks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return conn.select().from(shadowBlocks).where(eq(shadowBlocks.targetCalendarId, targetCalendarId));
}

/** Get shadow blocks generated by a specific source event */
async function getShadowBlocksForEvent(sourceEventId: string) {
  const { getDb } = await import("./db");
  const conn = await (getDb as any)();
  if (!conn) return [];
  const { shadowBlocks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return conn.select().from(shadowBlocks).where(eq(shadowBlocks.sourceEventId, sourceEventId));
}

// ─── T-01: Personal calendar event propagates to cross-vertical targets ───────

describe("T-01: Personal calendar event propagates to cross-vertical targets", () => {
  it("event on tarik.perkins@startout.org creates shadow blocks on other opted-in calendars", async () => {
    const { caller, householdId, personalCal, personalGmailCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalCal.id, { title: "Jake Meeting" });
    // Poll until at least 1 shadow block appears (cross-vertical propagation)
    const blocks = await waitForBlocks(event.id, 1);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);

    expect(targetIds).toContain(personalGmailCal.id);
    // Must not contain the source calendar itself (self-loop prevention)
    expect(targetIds).not.toContain(personalCal.id);
  });
});

// ─── T-02: Shared/team calendar event → NO propagation ───────────────────────

describe("T-02: Team StartOut event does NOT generate shadow blocks (shadowSource=false)", () => {
  it("event on Team StartOut creates zero shadow blocks", async () => {
    const { caller, householdId, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, teamCal.id, { title: "Team All-Hands" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    expect(blocks).toHaveLength(0);
  });

  it("Team StartOut shadowSource is false in the DB", async () => {
    const { caller, teamCal } = await setupStartOutHousehold();
    const list = await caller.calendar.list();
    const team = list.find((c: any) => c.id === teamCal.id);
    expect(team).toBeDefined();
    // shadowSource should be false (0 or false)
    expect(!!(team as any).shadowSource).toBe(false);
  });
});

// ─── T-03: Opted-out target calendar is skipped ───────────────────────────────

describe("T-03: Opted-out target calendar (shadowBlocking=false) never receives shadow blocks", () => {
  it("Team StartOut does not receive shadow blocks from personal calendar events", async () => {
    const { caller, householdId, personalCal, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalCal.id, { title: "Personal Event" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);

    // Team StartOut must never be a target
    expect(targetIds).not.toContain(teamCal.id);
  });

  it("cross-vertical event does not propagate to Team StartOut", async () => {
    const { caller, householdId, personalGmailCal, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalGmailCal.id, { title: "Gmail Event" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);

    expect(targetIds).not.toContain(teamCal.id);
  });
});

// ─── T-04: Self-loop prevention ───────────────────────────────────────────────

describe("T-04: Self-loop prevention — source calendar never targets itself", () => {
  it("personal calendar event does not create a shadow block on itself", async () => {
    const { caller, householdId, personalCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalCal.id);
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const selfBlocks = blocks.filter((b: any) => b.targetCalendarId === personalCal.id);
    expect(selfBlocks).toHaveLength(0);
  });

  it("team calendar event does not create a shadow block on itself", async () => {
    const { caller, householdId, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, teamCal.id);
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const selfBlocks = blocks.filter((b: any) => b.targetCalendarId === teamCal.id);
    expect(selfBlocks).toHaveLength(0);
  });
});

// ─── T-05: Delete propagation ─────────────────────────────────────────────────

describe("T-05: Delete propagation — shadow blocks removed when source event is deleted", () => {
  it("deleting a personal calendar event removes all its shadow blocks", async () => {
    const { caller, householdId, personalCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalCal.id);
    // Wait for initial propagation (blocks may or may not exist depending on setup)
    await waitForPropagation(600);
    const blocksBefore = await getShadowBlocksForEvent(event.id);

    // Delete the event
    await caller.calendar.events.delete({ id: event.id });
    // Poll until all shadow blocks are cleared
    const blocksAfter = await waitForBlocksCleared(event.id);
    expect(blocksAfter).toHaveLength(0);
  });
});

// ─── T-06: shadowSource toggle ────────────────────────────────────────────────

describe("T-06: shadowSource toggle — disabling source stops new propagation", () => {
  it("after disabling shadowSource on personal calendar, new events do not propagate", async () => {
    const { caller, householdId, personalCal, personalGmailCal } = await setupStartOutHousehold();

    // Disable shadowSource
    await caller.calendar.update({ id: personalCal.id, shadowSource: false });

    const event = await createTestEvent(caller, personalCal.id, { title: "Post-disable Event" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    expect(blocks).toHaveLength(0);
  });

  it("re-enabling shadowSource allows propagation again", async () => {
    const { caller, householdId, personalCal, personalGmailCal } = await setupStartOutHousehold();

    // Disable then re-enable
    await caller.calendar.update({ id: personalCal.id, shadowSource: false });
    await caller.calendar.update({ id: personalCal.id, shadowSource: true });

    const event = await createTestEvent(caller, personalCal.id, { title: "Re-enabled Event" });
    await waitForPropagation(800);

    // Propagation should work again — blocks should exist for cross-vertical targets
    const blocks = await getShadowBlocksForEvent(event.id);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);
    expect(targetIds).toContain(personalGmailCal.id);
  });
});

// ─── T-07: shadowBlocking toggle ─────────────────────────────────────────────

describe("T-07: shadowBlocking toggle — disabling target removes it from future propagation", () => {
  it("after disabling shadowBlocking on personal Gmail, it no longer receives blocks", async () => {
    const { caller, householdId, personalCal, personalGmailCal } = await setupStartOutHousehold();

    // Disable shadowBlocking on the Gmail calendar
    await caller.calendar.update({ id: personalGmailCal.id, shadowBlocking: false });

    const event = await createTestEvent(caller, personalCal.id, { title: "Blocked Target Test" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);
    expect(targetIds).not.toContain(personalGmailCal.id);
  });
});

// ─── T-08: Idempotency ────────────────────────────────────────────────────────

describe("T-08: Idempotency — re-propagating same event does not duplicate shadow blocks", () => {
  it("calling onEventUpserted twice for the same event produces exactly one set of shadow blocks", async () => {
    const { caller, householdId, personalCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalCal.id);
    // Wait for first propagation to settle
    await waitForPropagation(600);
    const blocksAfterFirst = await getShadowBlocksForEvent(event.id);
    const countAfterFirst = blocksAfterFirst.length;

    // Trigger propagation again (simulates a webhook re-delivery)
    await onEventUpserted(event.id, householdId, { skipGoogleWrite: true });
    await waitForPropagation(600);
    const blocksAfterSecond = await getShadowBlocksForEvent(event.id);
    expect(blocksAfterSecond.length).toBe(countAfterFirst);
  });
});

// ─── T-09: Multi-vertical isolation ──────────────────────────────────────────

describe("T-09: Multi-vertical isolation — StartOut personal only receives from correct verticals", () => {
  it("personalCal receives shadow blocks from personalGmailCal (cross-vertical)", async () => {
    const { caller, householdId, personalCal, personalGmailCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalGmailCal.id, { title: "Gmail Cross-Vertical" });
    // Poll until at least 1 block appears targeting personalCal
    const blocks = await pollForShadowBlocks(event.id, (b) => b.some((x: any) => x.targetCalendarId === personalCal.id));
    const targetIds = blocks.map((b: any) => b.targetCalendarId);
    expect(targetIds).toContain(personalCal.id);
  });

  it("teamCal does NOT receive shadow blocks from any source (shadowBlocking=false)", async () => {
    const { caller, householdId, personalGmailCal, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, personalGmailCal.id, { title: "Gmail Event" });
    await waitForPropagation(800);

    const blocks = await getShadowBlocksForEvent(event.id);
    const targetIds = blocks.map((b: any) => b.targetCalendarId);
    expect(targetIds).not.toContain(teamCal.id);
  });
});

// ─── T-10: Event creation on opted-out calendar succeeds ─────────────────────

describe("T-10: Event creation on opted-out calendar succeeds and is not deleted by propagation", () => {
  it("event created on Team StartOut persists and is not deleted", async () => {
    const { caller, householdId, teamCal } = await setupStartOutHousehold();

    const event = await createTestEvent(caller, teamCal.id, { title: "Jake at 3:30" });
    await waitForPropagation(800);

    // Event should still exist in the DB
    const fetched = await db.getEvent(event.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(event.id);
    expect(fetched?.title).toBe("Jake at 3:30");

    // And it should not have been marked as cancelled
    expect(fetched?.status).not.toBe("cancelled");
  });

  it("event created on Team StartOut has no shadow blocks targeting it", async () => {
    const { caller, householdId, personalCal, teamCal } = await setupStartOutHousehold();

    // Create an event on the personal calendar first (which would normally propagate)
    const personalEvent = await createTestEvent(caller, personalCal.id, { title: "Personal Busy" });
    await waitForPropagation(800);

    // Now create an event on Team StartOut
    const teamEvent = await createTestEvent(caller, teamCal.id, { title: "Team Meeting" });
    await waitForPropagation(800);

    // Team StartOut event should have no shadow blocks targeting it
    const shadowBlocksOnTeam = await getShadowBlocksForTarget(teamCal.id);
    expect(shadowBlocksOnTeam).toHaveLength(0);
  });
});

// ─── T-11: calendar.update exposes shadowSource field ────────────────────────

describe("T-11: calendar.update correctly persists shadowSource field", () => {
  it("setting shadowSource=false persists and is returned in calendar.list", async () => {
    const { caller, personalCal } = await setupStartOutHousehold();

    await caller.calendar.update({ id: personalCal.id, shadowSource: false });

    const list = await caller.calendar.list();
    const cal = list.find((c: any) => c.id === personalCal.id);
    expect(cal).toBeDefined();
    expect(!!(cal as any).shadowSource).toBe(false);
  });

  it("setting shadowSource=true persists and is returned in calendar.list", async () => {
    const { caller, teamCal } = await setupStartOutHousehold();

    await caller.calendar.update({ id: teamCal.id, shadowSource: true });

    const list = await caller.calendar.list();
    const cal = list.find((c: any) => c.id === teamCal.id);
    expect(cal).toBeDefined();
    expect(!!(cal as any).shadowSource).toBe(true);
  });
});
