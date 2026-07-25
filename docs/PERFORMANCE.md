# Geeves.Life — Performance Analysis & Optimisation Roadmap
**Version:** 2.0 — June 18, 2026 (post-implementation update)  
**Scope:** Calendar view load time and Properties Gantt load time  
**Author:** Manus AI — for review by Supah-T / Geeves product team

---

## Executive Summary

The calendar and property Gantt views are the two most performance-sensitive surfaces in Geeves. A performance sprint was completed on June 18, 2026, implementing the four highest-impact optimisations. The calendar `events.list` procedure now executes its three most expensive queries in parallel and uses batch helpers to eliminate N+1 loops. Three composite DB indexes have been applied to the live database. Two optimisations remain open: the `properties.getDashboardData` batched procedure and the `getVerticals` deduplication. The property Gantt still fires 3 separate queries per property with no server-side batching.

---

## 1. Bottleneck Analysis

### 1.1 `events.list` — N+1 Vertical Owner Checks

**Location:** `server/routers/calendar.ts`, line 114  
**Pattern:**
```ts
for (const v of allVerticals) {
  const isOwner = await db.isVerticalOwner(v.id, ctx.user.id); // ← 1 query per vertical
  if (isOwner) ownedVerticalIds.add(v.id);
}
```
**Impact:** For a household with 8 verticals, this loop executes 8 sequential DB queries. Each query is a simple `SELECT` on `vertical_owners` by `(verticalId, userId)`. These 8 queries could be replaced with a single `WHERE verticalId IN (...)` query.

**Fix:**
```ts
// db.ts — add this helper
export async function getOwnedVerticalIds(userId: string, householdId: string): Promise<string[]> {
  const rows = await db.select({ verticalId: verticalOwners.verticalId })
    .from(verticalOwners)
    .where(and(eq(verticalOwners.userId, userId), eq(verticals.householdId, householdId)))
    .innerJoin(verticals, eq(verticals.id, verticalOwners.verticalId));
  return rows.map(r => r.verticalId);
}
```
**Estimated saving:** 7 DB round-trips eliminated for an 8-vertical household.

---

### 1.2 `events.list` — N+1 Vertical Visibility Checks

**Location:** `server/routers/calendar.ts`, line 168  
**Pattern:**
```ts
for (const fromVerticalId of Array.from(memberVerticalIds)) {
  const rules = await db.getVerticalVisibility(fromVerticalId); // ← 1 query per member vertical
  const rule = rules.find(r => r.toVerticalId === v.id);
  ...
}
```
**Impact:** For a member with 3 assigned verticals, this loop executes 3 sequential queries inside an outer loop over all 8 verticals — up to 24 sequential queries just for visibility resolution.

**Fix:** Fetch all visibility rules for the household in a single query and build an in-memory lookup map:
```ts
// db.ts — add this helper
export async function getAllVerticalVisibilityForHousehold(householdId: string) {
  return db.select().from(verticalVisibility)
    .innerJoin(verticals, eq(verticals.id, verticalVisibility.fromVerticalId))
    .where(eq(verticals.householdId, householdId));
}
```
Then build a `Map<fromId, Map<toId, rule>>` in memory. Zero additional DB queries for the inner loop.

**Estimated saving:** Up to 24 DB round-trips eliminated.

---

### 1.3 `events.list` — `getVerticals` Called Twice

**Location:** `server/routers/calendar.ts`, lines ~110 and ~215  
**Pattern:** `getVerticals` is called once for the RBAC check and a second time for the busy-only label lookup. The result is identical both times.

**Fix:** Call it once, store the result, reuse it. One-line change.

**Estimated saving:** 1 DB round-trip.

---

### 1.4 `events` Table — Missing Composite Index

**Location:** `drizzle/schema.ts` — `events` table  
**Finding:** The `events` table has no index on `(householdId, startTime, endTime)`. The `getEvents` query filters by all three columns:
```sql
WHERE householdId = ? AND startTime < ? AND endTime > ?
```
Without an index, this is a full table scan. As the events table grows (recurring events generate many rows), this becomes the dominant query cost.

**Fix:** Add to `drizzle/schema.ts`:
```ts
(t) => ({
  householdTimeIdx: index("events_household_time_idx").on(t.householdId, t.startTime, t.endTime),
})
```
Then run `pnpm db:push` or apply via SQL:
```sql
CREATE INDEX events_household_time_idx ON events (householdId, startTime, endTime);
```

**Estimated saving:** Query time drops from O(n) full scan to O(log n) index seek. For 10,000 events, this is typically a 100–1000× speedup.

---

### 1.5 `shadow_blocks` Table — Missing Composite Index

**Location:** `drizzle/schema.ts` — `shadow_blocks` table  
**Finding:** `getShadowBlocksInRange` filters by `(householdId, startTime, endTime)` with no index. Same full-scan problem as the `events` table.

**Fix:** Add to `drizzle/schema.ts`:
```ts
(t) => ({
  uniqSourceTarget: uniqueIndex("shadow_blocks_source_target_uniq").on(t.sourceEventId, t.targetCalendarId),
  householdTimeIdx: index("sb_household_time_idx").on(t.householdId, t.startTime, t.endTime),
})
```
Note: the `uniqSourceTarget` constraint is already defined in the schema but was not applied to the live DB. Both should be applied together.

**Estimated saving:** Same as above — 100–1000× for the shadow blocks query.

---

### 1.6 `PropertyBookingTimeline` — 3 Queries Per Property, No Batching

**Location:** `client/src/pages/Home.tsx` — `PropertyBookingTimeline` component  
**Pattern:** Each property card fires three independent tRPC queries:
```ts
trpc.properties.getCompositeBookings.useQuery(...)  // query 1
trpc.properties.listPlatforms.useQuery(...)          // query 2
trpc.properties.getConflicts.useQuery(...)           // query 3
```
For a household with 5 properties, the dashboard fires 15 queries on load (after the initial household + properties queries). These are batched by tRPC's `httpBatchLink` into a single HTTP request, but the server still executes them sequentially.

**Fix — Option A (preferred):** Add a `properties.getDashboardData` procedure that returns composite bookings, platforms, and conflicts for all properties in a single call. The server executes the three queries in parallel with `Promise.all`.

**Fix — Option B:** Keep the per-property queries but add `Promise.all` inside each server-side procedure to parallelise the sub-queries.

**Estimated saving:** 3× reduction in server-side query time per property; eliminates the per-property waterfall on the dashboard.

---

## 2. Optimisation Priority Matrix

| # | Optimisation | Effort | Impact | Priority | Status |
|---|---|---|---|---|---|
| 1 | `events` table composite index on `(householdId, startTime, endTime)` | 10 min | Very High — eliminates full table scan | P0 | ✅ Applied June 18, 2026 |
| 2 | `events` table index on `(calendarId, startTime)` | 10 min | High — accelerates per-calendar queries | P0 | ✅ Applied June 18, 2026 |
| 3 | `shadow_blocks` table composite index on `(householdId, startTime, endTime)` | 10 min | Very High — eliminates full table scan | P0 | ✅ Applied June 18, 2026 |
| 4 | Batch all vertical owner checks into 1 query | 30 min | High — eliminates N sequential queries | P1 | ✅ `getOwnedVerticalIds` added to `db.ts`; wired in `calendar.ts` |
| 5 | Batch all vertical visibility checks into 1 query | 45 min | High — eliminates up to 24 sequential queries | P1 | ✅ `getAllVerticalVisibilityForHousehold` added to `db.ts`; wired in `calendar.ts` |
| 6 | Parallelise `getEvents` + `getShadowBlocksInRange` + `getVerticals` | 15 min | High — eliminates 3 serial DB calls | P1 | ✅ `Promise.all` applied in `events.list` |
| 7 | Deduplicate `getVerticals` call | 5 min | Low — saves 1 round-trip | P2 | ❌ Not yet done |
| 8 | `properties.getDashboardData` batched procedure | 2 hrs | Medium — reduces 15 queries to 5 for 5 properties | P2 | ❌ Not yet done |

---

## 3. Completed Optimisations (June 18, 2026)

The following SQL was applied to the live database during the performance sprint:

```sql
-- events table: composite index for time-range queries (APPLIED)
CREATE INDEX IF NOT EXISTS events_household_time_idx 
  ON events (householdId, startTime, endTime);

-- events table: per-calendar index (APPLIED)
CREATE INDEX IF NOT EXISTS events_calendar_start_idx
  ON events (calendarId, startTime);

-- shadow_blocks table: composite index for time-range queries (APPLIED)
CREATE INDEX IF NOT EXISTS sb_household_time_idx 
  ON shadow_blocks (householdId, startTime, endTime);
```

**Remaining SQL (not yet applied):**
```sql
-- shadow_blocks table: unique constraint (in schema; NOT YET applied to live DB)
CREATE UNIQUE INDEX IF NOT EXISTS shadow_blocks_source_target_uniq 
  ON shadow_blocks (sourceEventId, targetCalendarId);
```

---

## 4. Frontend Caching — Current State

The following caching defaults are already in place as of June 17, 2026:

| Setting | Value | Effect |
|---|---|---|
| QueryClient `staleTime` | 2 minutes | Data is not re-fetched within 2 minutes of last fetch |
| QueryClient `gcTime` | 10 minutes | Unused query data is kept in memory for 10 minutes |
| `refetchOnWindowFocus` | false | No re-fetch when user switches back to the browser tab |
| `compositeBookings` staleTime | 5 minutes | Per-property booking data cached for 5 minutes |
| `listPlatforms` staleTime | 10 minutes | Platform list cached for 10 minutes (rarely changes) |
| `getConflicts` staleTime | 5 minutes | Conflict data cached for 5 minutes |

These settings are appropriate. No changes recommended for the frontend cache layer.

---

## 5. Monitoring Recommendations

Once the index optimisations are applied, add query timing to the tRPC middleware to measure actual improvement:

```ts
// server/_core/trpc.ts — add to middleware
const start = Date.now();
const result = await next({ ctx });
const duration = Date.now() - start;
if (duration > 500) {
  console.warn(`[SLOW QUERY] ${path} took ${duration}ms`);
}
return result;
```

This will surface any remaining slow procedures in the dev server log without requiring external APM tooling.
