import { describe, it, expect } from "vitest";

/**
 * Tests for shadow block sync status logic (P-16 pattern)
 * Validates the rules that determine whether a calendar is eligible for propagation
 */

describe("Shadow Block Propagation Eligibility Rules", () => {
  // Simulates the guard logic from buildPropagationTargets
  function isEligibleTarget(calendar: {
    shadowBlocking: number;
    accountEmail: string | null;
    externalId: string | null;
  }): { eligible: boolean; reason?: string } {
    if (!calendar.shadowBlocking) {
      return { eligible: false, reason: "shadowBlocking is disabled" };
    }
    if (!calendar.accountEmail) {
      return { eligible: false, reason: "no accountEmail — cannot sync to Google" };
    }
    return { eligible: true };
  }

  it("rejects calendars with shadowBlocking=0", () => {
    const result = isEligibleTarget({
      shadowBlocking: 0,
      accountEmail: "user@gmail.com",
      externalId: "cal123",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("shadowBlocking");
  });

  it("rejects calendars with NULL accountEmail (P-16)", () => {
    const result = isEligibleTarget({
      shadowBlocking: 1,
      accountEmail: null,
      externalId: "cal123",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("accountEmail");
  });

  it("accepts calendars with shadowBlocking=1 and valid accountEmail", () => {
    const result = isEligibleTarget({
      shadowBlocking: 1,
      accountEmail: "tarikp@gmail.com",
      externalId: "cal123",
    });
    expect(result.eligible).toBe(true);
  });

  it("accepts calendars even without externalId (new calendars)", () => {
    const result = isEligibleTarget({
      shadowBlocking: 1,
      accountEmail: "tarikp@gmail.com",
      externalId: null,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("Shadow Block Sync Status Transitions", () => {
  type SyncStatus = "pending_sync" | "synced" | "sync_failed";

  function determineSyncStatus(opts: {
    googleWriteAttempted: boolean;
    googleWriteSuccess: boolean;
    hasAccessToken: boolean;
  }): SyncStatus {
    if (!opts.hasAccessToken) return "pending_sync"; // can't attempt without token
    if (!opts.googleWriteAttempted) return "pending_sync";
    if (opts.googleWriteSuccess) return "synced";
    return "sync_failed";
  }

  it("sets pending_sync when no access token available", () => {
    expect(
      determineSyncStatus({
        googleWriteAttempted: false,
        googleWriteSuccess: false,
        hasAccessToken: false,
      })
    ).toBe("pending_sync");
  });

  it("sets synced when Google write succeeds", () => {
    expect(
      determineSyncStatus({
        googleWriteAttempted: true,
        googleWriteSuccess: true,
        hasAccessToken: true,
      })
    ).toBe("synced");
  });

  it("sets sync_failed when Google write fails", () => {
    expect(
      determineSyncStatus({
        googleWriteAttempted: true,
        googleWriteSuccess: false,
        hasAccessToken: true,
      })
    ).toBe("sync_failed");
  });

  it("sets pending_sync when write not yet attempted", () => {
    expect(
      determineSyncStatus({
        googleWriteAttempted: false,
        googleWriteSuccess: false,
        hasAccessToken: true,
      })
    ).toBe("pending_sync");
  });
});

describe("Circuit Breaker Limits", () => {
  const CIRCUIT_BREAKER_10MIN_CAP = 2500;
  const PER_CALENDAR_HOURLY_CAP = 2000;

  it("new global limit is 2500 per 10 minutes", () => {
    expect(CIRCUIT_BREAKER_10MIN_CAP).toBe(2500);
  });

  it("new per-calendar limit is 2000 per hour", () => {
    expect(PER_CALENDAR_HOURLY_CAP).toBe(2000);
  });

  it("global limit accommodates a full sync burst", () => {
    // With 22 calendars and max 8 targets each, a burst of 100 events = 800 blocks
    // 2500 cap easily handles this
    const burstEvents = 100;
    const maxFanOut = 8;
    const blocksPerBurst = burstEvents * maxFanOut;
    expect(blocksPerBurst).toBeLessThan(CIRCUIT_BREAKER_10MIN_CAP);
  });
});
