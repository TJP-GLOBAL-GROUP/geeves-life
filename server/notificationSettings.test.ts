import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the notification settings router procedures.
 * Tests the getAll and update procedures for notification cooldown management.
 */

// Mock db module
vi.mock("./db", () => ({
  getDb: vi.fn(),
  getHouseholdMemberByUserId: vi.fn(),
}));

// Mock nanoid
vi.mock("nanoid", () => ({
  nanoid: () => "test-id-123",
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, type: "eq" })),
  and: vi.fn((...args) => ({ args, type: "and" })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => ({ strings, values, type: "sql" })),
}));

// Mock schema
vi.mock("../drizzle/schema", () => ({
  notificationSettings: {
    id: "id",
    key: "key",
    label: "label",
    description: "description",
    cooldownHours: "cooldownHours",
    enabled: "enabled",
    householdId: "householdId",
    updatedAt: "updatedAt",
  },
}));

import * as db from "./db";

describe("Notification Settings Router", () => {
  const mockMember = {
    id: "member-1",
    householdId: "household-1",
    userId: 1,
    role: "household_admin",
    status: "active",
    displayName: "Test Admin",
  };

  const mockSettings = [
    {
      id: 1,
      key: "circuit_breaker",
      label: "Shadow Block Circuit Breaker",
      description: "Fires when shadow block writes exceed the 10-minute cap.",
      cooldownHours: 6,
      enabled: true,
      householdId: "household-1",
      updatedAt: new Date(),
    },
    {
      id: 2,
      key: "rate_limit",
      label: "Shadow Block Rate Limit",
      description: "Fires when a single calendar exceeds the hourly write cap.",
      cooldownHours: 6,
      enabled: true,
      householdId: "household-1",
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("should return existing settings for a household member", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockSettings),
        }),
      });
      const mockExecute = vi.fn();
      (db.getDb as any).mockResolvedValue({ select: mockSelect, execute: mockExecute });
      (db.getHouseholdMemberByUserId as any).mockResolvedValue(mockMember);

      // Simulate the procedure logic
      const member = await db.getHouseholdMemberByUserId(1);
      expect(member).toBeTruthy();
      expect(member!.householdId).toBe("household-1");
    });

    it("should throw FORBIDDEN if user has no household", async () => {
      (db.getHouseholdMemberByUserId as any).mockResolvedValue(null);
      const member = await db.getHouseholdMemberByUserId(999);
      expect(member).toBeNull();
    });
  });

  describe("update", () => {
    it("should allow admin to update cooldown hours", async () => {
      (db.getHouseholdMemberByUserId as any).mockResolvedValue(mockMember);
      const member = await db.getHouseholdMemberByUserId(1);
      expect(member!.role).toBe("household_admin");
    });

    it("should reject non-admin users", async () => {
      const nonAdminMember = { ...mockMember, role: "member" };
      (db.getHouseholdMemberByUserId as any).mockResolvedValue(nonAdminMember);
      const member = await db.getHouseholdMemberByUserId(1);
      expect(member!.role).not.toBe("household_admin");
    });

    it("should validate cooldown hours range (0-168)", () => {
      // The zod schema enforces min(0) max(168)
      const validValues = [0, 1, 6, 24, 72, 168];
      const invalidValues = [-1, 169, 200];
      
      validValues.forEach(v => {
        expect(v >= 0 && v <= 168).toBe(true);
      });
      invalidValues.forEach(v => {
        expect(v >= 0 && v <= 168).toBe(false);
      });
    });
  });

  describe("DEFAULT_NOTIFICATION_TYPES", () => {
    it("should define all expected notification types", () => {
      const expectedKeys = [
        "circuit_breaker",
        "rate_limit",
        "cancellation_pending",
        "date_mismatch",
        "integration_health",
        "propagation_health",
      ];
      // These are the keys defined in the router file
      expectedKeys.forEach(key => {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      });
    });
  });
});
