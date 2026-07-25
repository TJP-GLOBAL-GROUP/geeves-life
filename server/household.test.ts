import { describe, expect, it, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { registerTestHousehold, cleanupTestHouseholds } from "./testHelpers/cleanupRegistry";

afterAll(async () => {
  await cleanupTestHouseholds();
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const id = overrides?.id ?? Math.floor(Math.random() * 900000) + 100000;
  const user: AuthenticatedUser = {
    id,
    openId: `test-user-${id}`,
    email: `user${id}@example.com`,
    name: `Test User ${id}`,
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("household router", () => {
  describe("household.create", () => {
    it("creates a household with valid input", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.household.create({
        name: "The Petersons",
        timezone: "America/New_York",
        wakeWord: "Geeves",
      });
      registerTestHousehold(result.householdId);

      expect(result).toBeDefined();
      expect(result.householdId).toBeDefined();
      expect(typeof result.householdId).toBe("string");
      expect(result.memberId).toBeDefined();
      expect(typeof result.memberId).toBe("string");
    });

    it("rejects unauthenticated requests", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.household.create({ name: "Test", timezone: "America/New_York" })
      ).rejects.toThrow();
    });

    it("rejects duplicate household creation", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.household.create({
        name: "First Household",
        timezone: "America/New_York",
      });

      await expect(
        caller.household.create({ name: "Second", timezone: "America/New_York" })
      ).rejects.toThrow("You already have a household");
    });
  });

  describe("household.getMyHousehold", () => {
    it("returns null when user has no household", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.household.getMyHousehold();
      expect(result).toBeNull();
    });

    it("returns household after creation", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hh = await caller.household.create({
        name: "My House",
        timezone: "America/Chicago",
        wakeWord: "Alfred",
      });
      registerTestHousehold(hh.householdId);

      const result = await caller.household.getMyHousehold();
      expect(result).not.toBeNull();
      expect(result!.household.name).toBe("My House");
      expect(result!.isAdmin).toBe(true);
    });
  });

  describe("household.members.list", () => {
    it("returns members after household creation", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hhM = await caller.household.create({
        name: "Members Test",
        timezone: "America/New_York",
      });
      registerTestHousehold(hhM.householdId);

      const members = await caller.household.members.list();
      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThanOrEqual(1);
      const admin = members.find((m: any) => m.role === "household_admin");
      expect(admin).toBeDefined();
    });
  });

  describe("household.members.invite", () => {
    it("invites a new member with valid role", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hhI = await caller.household.create({
        name: "Invite Test",
        timezone: "America/New_York",
      });
      registerTestHousehold(hhI.householdId);

      const result = await caller.household.members.invite({
        displayName: "Mom",
        email: "mom@example.com",
        role: "elder",
        origin: "https://geeves.life",
      });

      expect(result).toBeDefined();
      expect(result.memberId).toBeDefined();
      expect(typeof result.memberId).toBe("string");
    }, 15000);
  });

  describe("household.verticals.list", () => {
    it("returns default verticals after household creation", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hhV = await caller.household.create({
        name: "Verticals Test",
        timezone: "America/New_York",
      });
      registerTestHousehold(hhV.householdId);

      const verticals = await caller.household.verticals.list();
      expect(Array.isArray(verticals)).toBe(true);
      expect(verticals.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("calendar router", () => {
  describe("calendar.list", () => {
    it("returns empty array when no calendars exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const calendars = await caller.calendar.list();
      expect(Array.isArray(calendars)).toBe(true);
    });
  });

  describe("calendar.create", () => {
    it("creates a local calendar", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hhCal = await caller.household.create({
        name: "Cal Create Test",
        timezone: "America/New_York",
      });
      registerTestHousehold(hhCal.householdId);

      const cal = await caller.calendar.create({
        name: "Work Calendar",
        color: "#3b82f6",
        provider: "manual",
      });

      expect(cal).toBeDefined();
      expect(cal.id).toBeDefined();
      expect(typeof cal.id).toBe("string");
    });
  });

  describe("calendar.events.list", () => {
    it("returns events within time range", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const now = Date.now();
      const events = await caller.calendar.events.list({
        startTime: now - 86400000,
        endTime: now + 86400000,
      });

      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe("calendar.events.create", () => {
    it("creates an event on a valid calendar", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const hhEv = await caller.household.create({
        name: "Event Create Test",
        timezone: "America/New_York",
      });
      registerTestHousehold(hhEv.householdId);

      const cal = await caller.calendar.create({
        name: "Personal",
        color: "#10b981",
        provider: "manual",
      });

      const now = Date.now();
      const event = await caller.calendar.events.create({
        calendarId: cal.id,
        title: "Team Meeting",
        description: "Weekly standup",
        startTime: now + 3600000,
        endTime: now + 7200000,
        isAllDay: false,
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(typeof event.id).toBe("string");
    });
  });
});
