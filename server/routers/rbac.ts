/**
 * Role-Based Access Control (RBAC) for Geeves Life
 *
 * Role Architecture:
 * - Platform level (users.role): "user" | "system_admin"
 *   → system_admin is developer/platform access, invisible to end-user families
 *
 * - Household level (householdMembers.role): "household_admin" | "ea" | "member" | "caregiver" | "child" | "elder"
 *   → household_admin is co-equal family head (multiple allowed, no single "owner")
 *   → All household_admins have identical permissions
 *
 * Calendar Visibility Model (Phase 1 v1.5):
 * ─────────────────────────────────────────
 * calendar.view_all  → sees ALL events on ALL calendars in the household (no filter)
 * calendar.view_vertical → sees events on calendars in their assigned verticals + busy_only
 *                          shadow blocks from other verticals per cross-vertical visibility rules
 * calendar.view_own  → sees events on calendars explicitly assigned to them only
 *
 * Role → visibility tier:
 *   household_admin  → calendar.view_all (full, unfiltered)
 *   ea               → calendar.view_vertical (all verticals except blind ones) + busy_only floor
 *   member           → calendar.view_vertical (own verticals only)
 *   caregiver        → calendar.view_own (assigned calendars only)
 *   child            → calendar.view_own
 *   elder            → calendar.view_own
 *
 * Vertical Privacy Levels:
 *   household   → visible to all roles at their tier's visibility level
 *   admin_only  → visible only to household_admin; EA sees busy_only blocks (floor rule)
 *   private     → visible only to named owners; all others see nothing (no busy blocks)
 *
 * Booking Requests:
 *   member, caregiver, child, elder → can submit booking requests for FREE slots only
 *   ea, household_admin             → can approve/decline booking requests
 *
 * Financial Capabilities (v2.2 §4, D9):
 *   The two legacy global flags (finance.view / finance.manage) are DEPRECATED
 *   aliases during transition. Authorisation for every financial procedure runs
 *   through server/finance/access.ts → canAccessFinancials(), which resolves the
 *   five vertical-scoped + two global capabilities below per vertical. Only
 *   household_admin holds the new capabilities as role baseline; all other
 *   holders gain them via vertical_owners.isFinancialOwner, vertical_member_access
 *   level, or an explicit member_permission_overrides row — never via ROLE_PERMISSIONS.
 *
 * NOTE: this file is a byte-identical copy of server/auth/rbac.ts — keep both in sync.
 */

import { TRPCError } from "@trpc/server";
import type { HouseholdMember } from "../../drizzle/schema";

export const ROLE_HIERARCHY: Record<string, number> = {
  household_admin: 100, ea: 70, member: 50, caregiver: 30, elder: 20, child: 10,
};

export type Permission =
  | "household.manage" | "household.invite" | "household.remove" | "household.delete"
  // Calendar tiers — use these instead of raw calendar.view_all for access control
  | "calendar.view_all"        // household_admin only — no filtering
  | "calendar.view_vertical"   // ea + member — filtered by vertical access + cross-vertical visibility
  | "calendar.view_own"        // caregiver, child, elder — assigned calendars only
  | "calendar.edit"            // can create/update/delete events
  | "calendar.manage"          // can manage calendar settings, sync, webhooks
  | "booking.request"          // can submit booking requests for free slots
  | "booking.manage"           // can approve/decline booking requests
  | "shadow.manage" | "vertical.manage" | "property.manage" | "device.control"
  | "notes.create" | "notes.view_all" | "shopping.manage"
  // DEPRECATED global finance flags — transition aliases only (see header note)
  | "finance.view" | "finance.manage"
  // v2.2 §4.1 vertical-scoped financial capabilities (resolved per vertical)
  | "finance.view_aggregate" | "finance.view_detail" | "finance.post"
  | "finance.resolve_workbench" | "finance.export_qbo"
  // v2.2 §4.1 global financial capabilities
  | "finance.assign_vertical" | "finance.view_sensitive"
  | "member.edit_self" | "member.view_all" | "subscription.manage";

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  household_admin: [
    "household.manage", "household.invite", "household.remove", "household.delete",
    "calendar.view_all", "calendar.view_vertical", "calendar.view_own",
    "calendar.edit", "calendar.manage",
    "booking.manage",
    "shadow.manage", "vertical.manage", "property.manage", "device.control",
    "notes.create", "notes.view_all", "shopping.manage",
    "finance.view", "finance.manage",
    // v2.2: household_admin holds every financial capability on every vertical
    // (Global ledger, D7). All other roles gain these per-vertical via the resolver.
    "finance.view_aggregate", "finance.view_detail", "finance.post",
    "finance.resolve_workbench", "finance.export_qbo",
    "finance.assign_vertical", "finance.view_sensitive",
    "member.edit_self", "member.view_all", "subscription.manage",
  ],
  ea: [
    // EA sees all verticals at their visibility level (busy_only floor on admin_only verticals)
    "calendar.view_vertical", "calendar.view_own",
    "calendar.edit", "calendar.manage",
    "booking.manage",
    "shadow.manage", "notes.create", "notes.view_all", "shopping.manage",
    // EA can invite new household members (optional authorised delegation feature)
    "household.invite",
    // v2.2: EA financial capabilities are granted per-vertical by the resolver
    // (full on assigned verticals ⇒ aggregate/detail/post/resolve) — deliberately
    // NOT a role baseline here, so unassigned verticals stay denied.
    "member.edit_self", "member.view_all",
  ],
  member: [
    // Member sees only their assigned verticals; other verticals show busy_only per visibility rules
    "calendar.view_vertical", "calendar.view_own",
    // Members cannot create/edit events — they submit booking requests instead
    "booking.request",
    // finance.view retained as deprecated alias ⇒ finance.view_aggregate via resolver
    "notes.create", "shopping.manage", "finance.view", "member.edit_self", "member.view_all",
  ],
  caregiver: [
    "calendar.view_own", "calendar.edit",
    "booking.request",
    "notes.create", "member.edit_self",
  ],
  child: [
    "calendar.view_own",
    "booking.request",
    "notes.create", "member.edit_self",
  ],
  elder: [
    "calendar.view_own", "calendar.edit",
    "booking.request",
    "notes.create", "shopping.manage", "member.edit_self",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function canManageRole(actorRole: string, targetRole: string): boolean {
  // household_admins cannot manage other household_admins (they are co-equal)
  if (actorRole === "household_admin" && targetRole === "household_admin") return false;
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

export function requirePermission(member: HouseholdMember | null, permission: Permission): void {
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a household member" });
  if (!hasPermission(member.role, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Role '${member.role}' lacks permission '${permission}'` });
  }
}

/**
 * Returns the calendar visibility tier for a given role.
 * Used by events.list to determine which filter layer to apply.
 */
export function getCalendarVisibilityTier(role: string): "all" | "vertical" | "own" {
  if (hasPermission(role, "calendar.view_all")) return "all";
  if (hasPermission(role, "calendar.view_vertical")) return "vertical";
  return "own";
}

/**
 * Returns whether a role can see events on a vertical with a given privacy level.
 * Used by the three-layer filter in events.list.
 *
 * privacy levels:
 *   household   → all roles at their tier can see it
 *   admin_only  → only household_admin sees full events; EA sees busy_only; others see nothing
 *   private     → only named vertical owners see full events; everyone else sees nothing
 */
export function canSeeVertical(
  role: string,
  privacyLevel: "household" | "admin_only" | "private",
  isVerticalOwner: boolean,
): "full" | "busy_only" | "none" {
  if (privacyLevel === "private") {
    return isVerticalOwner ? "full" : "none";
  }
  if (privacyLevel === "admin_only") {
    if (role === "household_admin") return "full";
    if (role === "ea") return "busy_only"; // EA floor rule
    return "none";
  }
  // household privacy — apply role tier
  if (role === "household_admin") return "full";
  if (role === "ea") return "full"; // EA sees full on household-privacy verticals
  // member and below: depends on cross-vertical visibility rules (handled in events.list)
  return "full";
}

export function getUIVariant(role: string): "standard" | "picture_board" | "large_text" | "voice_only" {
  switch (role) {
    case "child": return "picture_board";
    case "elder": return "large_text";
    default: return "standard";
  }
}

/**
 * Complete list of all permissions in the system.
 * Used by the unified Member Permissions page to render all permission rows.
 */
export const ALL_PERMISSIONS: Permission[] = [
  "household.manage", "household.invite", "household.remove", "household.delete",
  "calendar.view_all", "calendar.view_vertical", "calendar.view_own",
  "calendar.edit", "calendar.manage",
  "booking.request", "booking.manage",
  "shadow.manage", "vertical.manage", "property.manage", "device.control",
  "notes.create", "notes.view_all", "shopping.manage",
  "finance.view", "finance.manage",
  "finance.view_aggregate", "finance.view_detail", "finance.post",
  "finance.resolve_workbench", "finance.export_qbo",
  "finance.assign_vertical", "finance.view_sensitive",
  "member.edit_self", "member.view_all", "subscription.manage",
];

/**
 * Permission groups for the unified Member Permissions page UI.
 * Each group has a label, description, and list of permissions to display.
 * v2.2 §4.1: financial permissions have their own `finance` group — out of `content`.
 */
export const PERMISSION_GROUPS: Array<{
  group: string;
  label: string;
  description: string;
  permissions: Array<{ key: Permission; label: string; description: string; globalOnly?: boolean }>;
}> = [
  {
    group: "household",
    label: "Household Management",
    description: "Actions that affect the household structure and membership",
    permissions: [
      { key: "household.invite",  label: "Invite Members",    description: "Send invitations to new household members", globalOnly: true },
      { key: "household.remove",  label: "Remove Members",    description: "Remove a member from the household", globalOnly: true },
      { key: "household.manage",  label: "Manage Household",  description: "Edit household name, settings, and group name", globalOnly: true },
      { key: "household.delete",  label: "Delete Household",  description: "Permanently delete the household and all data", globalOnly: true },
    ],
  },
  {
    group: "calendar",
    label: "Calendar Access",
    description: "What the member can see and do on calendars",
    permissions: [
      { key: "calendar.view_all",      label: "View All Calendars",     description: "See all events on all household calendars (no filter)" },
      { key: "calendar.view_vertical", label: "View Vertical Calendars", description: "See events on assigned verticals + busy blocks from others" },
      { key: "calendar.view_own",      label: "View Own Calendars",      description: "See events only on calendars explicitly assigned to them" },
      { key: "calendar.edit",          label: "Edit Events",             description: "Create, update, and delete calendar events" },
      { key: "calendar.manage",        label: "Manage Calendar Settings", description: "Configure sync, webhooks, and calendar metadata" },
    ],
  },
  {
    group: "bookings",
    label: "Booking Requests",
    description: "How the member interacts with the booking request system",
    permissions: [
      { key: "booking.request", label: "Submit Booking Requests", description: "Request free time slots from the household owner" },
      { key: "booking.manage",  label: "Manage Booking Requests", description: "Approve or decline booking requests from other members" },
    ],
  },
  {
    group: "content",
    label: "Content & Shopping",
    description: "Access to notes and shopping",
    permissions: [
      { key: "notes.create",    label: "Create Notes",       description: "Create and edit notes" },
      { key: "notes.view_all",  label: "View All Notes",     description: "See notes created by all household members" },
      { key: "shopping.manage", label: "Manage Shopping",    description: "Create and edit shopping lists and orders" },
    ],
  },
  {
    group: "finance",
    label: "Finance",
    description: "Vertical-scoped financial access (resolved per vertical by canAccessFinancials)",
    permissions: [
      { key: "finance.view_aggregate",    label: "View Financial Totals",     description: "Vertical totals, trends and headlines — no line detail or memos" },
      { key: "finance.view_detail",       label: "View Financial Detail",     description: "Individual journal entries and lines within granted verticals" },
      { key: "finance.post",              label: "Post Entries",              description: "Create and post journal entries in granted verticals" },
      { key: "finance.resolve_workbench", label: "Resolve Workbench Items",   description: "Resolve review-queue items in granted verticals" },
      { key: "finance.export_qbo",        label: "Export to QuickBooks",      description: "Approve and push QBO batches (household admin only by default)", globalOnly: true },
      { key: "finance.assign_vertical",   label: "Assign Verticals (Unassigned Queue)", description: "Resolve items whose vertical is undetermined (household admin only)", globalOnly: true },
      { key: "finance.view_sensitive",    label: "View Sensitive Finance",    description: "Salary, emoluments and child-medical attributes — audited on every use", globalOnly: true },
      // Deprecated global aliases — retained during transition, resolve to the scoped capabilities
      { key: "finance.view",              label: "View Financials (deprecated)",  description: "Deprecated alias for View Financial Totals" },
      { key: "finance.manage",            label: "Manage Financials (deprecated)", description: "Deprecated alias for Post Entries" },
    ],
  },
  {
    group: "admin",
    label: "Administration",
    description: "System and household administration capabilities",
    permissions: [
      { key: "vertical.manage",    label: "Manage Verticals",    description: "Create, edit, and delete verticals", globalOnly: true },
      { key: "property.manage",    label: "Manage Properties",   description: "Create, edit, and delete rental properties", globalOnly: true },
      { key: "shadow.manage",      label: "Manage Shadow Blocks", description: "Create and edit shadow/busy blocks on calendars" },
      { key: "device.control",     label: "Control Devices",     description: "Manage Geeves Hub and Node devices", globalOnly: true },
      { key: "member.view_all",    label: "View All Members",    description: "See the full member list and their profiles" },
      { key: "member.edit_self",   label: "Edit Own Profile",    description: "Edit their own member profile" },
      { key: "subscription.manage", label: "Manage Subscription", description: "View and change the household subscription plan", globalOnly: true },
    ],
  },
];
