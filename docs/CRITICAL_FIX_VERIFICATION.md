# Critical Fix Verification — New Sandbox
**Date:** 2026-07-13

## Check 1: Properties Nav Filter — ✅ PASS
**File:** `client/src/components/DashboardLayout.tsx` (note: NOT in `layout/` subdirectory)
**Line 291:** `if (item.path === "/properties" && !isAdminOrEA) return false;`
**Status:** CORRECT — uses `!isAdminOrEA` not `!hasVerticalAccess`

## Check 2: DST Bug Fix — ✅ PASS
**File:** `server/services/icalAggregator.ts`
**Line 453:** `cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);`
**Line 477:** `blockEndDate.setUTCDate(blockEndDate.getUTCDate() + 1);`
**Status:** CORRECT — both locations use `setUTCDate()` pattern
**Note:** Line 394 has a remaining `86400000` for a DST offset calculation (different purpose — correct) and line 944 has `MS_PER_DAY = 86400000` as a named constant (also correct).

## Check 3: Focus Retention — ✅ PASS
**File:** `client/src/pages/CalendarView.tsx`
**Status:** `BookingRequestDialog` is defined as an inline function component at line 1928 (not imported). CalendarView uses `useRef`, `useEffect`, `useMemo`. The MIGRATION_NOTES.txt confirms: "BookingRequestDialog useMemo side-effect replaced with useEffect+useRef."

## Check 4: Admin Invite Guard — ⚠️ PARTIAL
**File:** `server/routers/household.ts` (note: in `routers/` not `auth/`)
**Line 125:** `if (input.role !== "household_admin" && !canManageRole(actorMember.role, input.role))`
**Status:** The guard exists but uses the OLD logic pattern (short-circuits when role IS household_admin). The fix specified in MIGRATION_PROMPTS_UPDATED.md was:
```
if (input.role === "household_admin" && actorMember.role !== "household_admin") {
  throw new TRPCError({ code: "FORBIDDEN", message: "Only household admins can invite other household admins" });
}
```
The current code does NOT have this explicit check — it still uses the inverted condition that was identified as the bug. **FIX NEEDED.**

## Check 5: Role Promotion Guard — ⚠️ PARTIAL
**File:** `server/routers/household.ts`
**Lines 430-432:** The EA admin-owner check is present, but the explicit `canManageRole` check for role promotion (preventing EA from promoting to EA or admin) is NOT present before `const updateData`.
**Status:** **FIX NEEDED.**

## Check 6: Geeves AI RBAC — ❌ FAIL
**File:** `server/routers/geeves.ts`
**Status:** `executeTool` exists at line 244, but there is NO `authorizeToolAccess` function, NO `hasPermission` import, NO `geevesAccess` check, NO auth gate at the top of `executeTool`.
**Status:** **FIX NEEDED.**

---

## Summary

| # | Fix | Status |
|---|-----|--------|
| 1 | Properties Nav Filter | ✅ PASS |
| 2 | DST Bug Fix | ✅ PASS |
| 3 | Focus Retention | ✅ PASS |
| 4 | Admin Invite Guard | ⚠️ NEEDS FIX |
| 5 | Role Promotion Guard | ⚠️ NEEDS FIX |
| 6 | Geeves AI RBAC | ❌ NEEDS FIX |

Fixes 4, 5, and 6 need to be applied.
