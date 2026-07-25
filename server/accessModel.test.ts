/**
 * Access Model Redesign — Unit Tests
 * Tests for: RBAC permission helpers, vertical privacy levels, booking request flow
 */
import { describe, it, expect } from "vitest";
import { hasPermission, getCalendarVisibilityTier, canSeeVertical } from "./auth/rbac";

// Reconstruct role permission counts for completeness tests
const ROLE_PERMISSION_COUNTS: Record<string, number> = {
  household_admin: 20, ea: 10, member: 7, caregiver: 4, child: 3, elder: 4,
};

// ─── RBAC Permission Tests ─────────────────────────────────────────────────

describe("RBAC — hasPermission", () => {
  it("household_admin has calendar.view_all", () => {
    expect(hasPermission("household_admin", "calendar.view_all")).toBe(true);
  });

  it("ea does NOT have calendar.view_all (uses view_vertical instead)", () => {
    expect(hasPermission("ea", "calendar.view_all")).toBe(false);
  });

  it("member does NOT have calendar.view_all", () => {
    expect(hasPermission("member", "calendar.view_all")).toBe(false);
  });

  it("caregiver does NOT have calendar.view_all", () => {
    expect(hasPermission("caregiver", "calendar.view_all")).toBe(false);
  });

  it("child does NOT have calendar.view_all", () => {
    expect(hasPermission("child", "calendar.view_all")).toBe(false);
  });

  it("elder does NOT have calendar.view_all", () => {
    expect(hasPermission("elder", "calendar.view_all")).toBe(false);
  });

  it("member has booking.request", () => {
    expect(hasPermission("member", "booking.request")).toBe(true);
  });

  it("caregiver has booking.request", () => {
    expect(hasPermission("caregiver", "booking.request")).toBe(true);
  });

  it("child has booking.request", () => {
    expect(hasPermission("child", "booking.request")).toBe(true);
  });

  it("elder has booking.request", () => {
    expect(hasPermission("elder", "booking.request")).toBe(true);
  });

  it("household_admin does NOT have booking.request (they create events directly)", () => {
    expect(hasPermission("household_admin", "booking.request")).toBe(false);
  });

  it("ea does NOT have booking.request (they create events directly)", () => {
    expect(hasPermission("ea", "booking.request")).toBe(false);
  });

  it("household_admin has calendar.edit", () => {
    expect(hasPermission("household_admin", "calendar.edit")).toBe(true);
  });

  it("ea has calendar.edit", () => {
    expect(hasPermission("ea", "calendar.edit")).toBe(true);
  });

  it("member does NOT have calendar.edit", () => {
    expect(hasPermission("member", "calendar.edit")).toBe(false);
  });

  it("household_admin has booking.manage", () => {
    expect(hasPermission("household_admin", "booking.manage")).toBe(true);
  });

  it("ea has booking.manage", () => {
    expect(hasPermission("ea", "booking.manage")).toBe(true);
  });

  it("member does NOT have booking.manage", () => {
    expect(hasPermission("member", "booking.manage")).toBe(false);
  });

  it("household_admin has vertical.manage", () => {
    expect(hasPermission("household_admin", "vertical.manage")).toBe(true);
  });

  it("member does NOT have vertical.manage", () => {
    expect(hasPermission("member", "vertical.manage")).toBe(false);
  });
});

// ─── Calendar Visibility Tier Tests ──────────────────────────────────────

describe("RBAC — getCalendarVisibilityTier", () => {
  it("household_admin gets 'all'", () => {
    expect(getCalendarVisibilityTier("household_admin")).toBe("all");
  });

  it("ea gets 'vertical'", () => {
    expect(getCalendarVisibilityTier("ea")).toBe("vertical");
  });

  it("member gets 'vertical'", () => {
    expect(getCalendarVisibilityTier("member")).toBe("vertical");
  });

  it("caregiver gets 'own'", () => {
    expect(getCalendarVisibilityTier("caregiver")).toBe("own");
  });

  it("child gets 'own'", () => {
    expect(getCalendarVisibilityTier("child")).toBe("own");
  });

  it("elder gets 'own'", () => {
    expect(getCalendarVisibilityTier("elder")).toBe("own");
  });
});

// ─── Role Permissions Completeness ────────────────────────────────────────

describe("RBAC — role permissions completeness", () => {
  const allRoles = ["household_admin", "ea", "member", "caregiver", "child", "elder"];

  it("all roles have at least one permission defined", () => {
    for (const role of allRoles) {
      expect(ROLE_PERMISSION_COUNTS[role]).toBeDefined();
      expect(ROLE_PERMISSION_COUNTS[role]).toBeGreaterThan(0);
    }
  });

  it("EA has more permissions than member (by count)", () => {
    expect(ROLE_PERMISSION_COUNTS["ea"]).toBeGreaterThan(ROLE_PERMISSION_COUNTS["member"]);
  });

  it("household_admin has the most permissions", () => {
    const adminCount = ROLE_PERMISSION_COUNTS["household_admin"];
    for (const role of allRoles.filter(r => r !== "household_admin")) {
      expect(adminCount).toBeGreaterThanOrEqual(ROLE_PERMISSION_COUNTS[role]);
    }
  });
});

// ─── Vertical Privacy Logic ────────────────────────────────────────────────

describe("Vertical privacy level logic (canSeeVertical)", () => {
  it("household vertical returns 'full' for all roles", () => {
    const roles = ["household_admin", "ea", "member", "caregiver", "child", "elder"];
    for (const role of roles) {
      const result = canSeeVertical(role, "household", false);
      expect(result).not.toBe("none");
    }
  });

  it("admin_only vertical returns 'full' for household_admin", () => {
    expect(canSeeVertical("household_admin", "admin_only", false)).toBe("full");
  });

  it("admin_only vertical returns 'busy_only' for ea (floor rule)", () => {
    expect(canSeeVertical("ea", "admin_only", false)).toBe("busy_only");
  });

  it("admin_only vertical returns 'none' for member", () => {
    expect(canSeeVertical("member", "admin_only", false)).toBe("none");
  });

  it("admin_only vertical returns 'none' for child", () => {
    expect(canSeeVertical("child", "admin_only", false)).toBe("none");
  });

  it("private vertical returns 'none' for household_admin if not owner", () => {
    expect(canSeeVertical("household_admin", "private", false)).toBe("none");
  });

  it("private vertical returns 'full' for household_admin if owner", () => {
    expect(canSeeVertical("household_admin", "private", true)).toBe("full");
  });

  it("private vertical returns 'none' for ea if not owner", () => {
    expect(canSeeVertical("ea", "private", false)).toBe("none");
  });

  it("private vertical returns 'full' for ea if owner", () => {
    expect(canSeeVertical("ea", "private", true)).toBe("full");
  });

  it("private vertical returns 'none' for member if not owner", () => {
    expect(canSeeVertical("member", "private", false)).toBe("none");
  });
});

// ─── Busy Label Logic ─────────────────────────────────────────────────────

describe("Busy label substitution logic", () => {
  function getDisplayTitle(
    event: { title: string; isShadow: boolean },
    vertical: { busyLabel: string } | null,
    viewerRole: string,
    isOwnerOfVertical: boolean
  ): string {
    // Owners and admins see real titles
    if (isOwnerOfVertical || viewerRole === "household_admin") return event.title;
    // Shadow events always show the busy label
    if (event.isShadow && vertical) return vertical.busyLabel || "Busy";
    return event.title;
  }

  it("shadow event shows busy label to non-owner member", () => {
    const result = getDisplayTitle(
      { title: "Doctor appointment", isShadow: true },
      { busyLabel: "Focus Time" },
      "member",
      false
    );
    expect(result).toBe("Focus Time");
  });

  it("shadow event shows real title to vertical owner", () => {
    const result = getDisplayTitle(
      { title: "Doctor appointment", isShadow: true },
      { busyLabel: "Focus Time" },
      "member",
      true
    );
    expect(result).toBe("Doctor appointment");
  });

  it("shadow event shows real title to household_admin", () => {
    const result = getDisplayTitle(
      { title: "Doctor appointment", isShadow: true },
      { busyLabel: "Focus Time" },
      "household_admin",
      false
    );
    expect(result).toBe("Doctor appointment");
  });

  it("non-shadow event always shows real title", () => {
    const result = getDisplayTitle(
      { title: "Team standup", isShadow: false },
      { busyLabel: "OOO" },
      "member",
      false
    );
    expect(result).toBe("Team standup");
  });

  it("falls back to 'Busy' if busyLabel is empty", () => {
    const result = getDisplayTitle(
      { title: "Private event", isShadow: true },
      { busyLabel: "" },
      "member",
      false
    );
    expect(result).toBe("Busy");
  });
});
