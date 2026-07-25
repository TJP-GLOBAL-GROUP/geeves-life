/**
 * cleanupRegistry.ts
 *
 * Tracks household IDs created during tests and deletes them (with all
 * dependent data) in afterAll hooks.  Import `registerTestHousehold` in
 * every test file that creates a household, then call `cleanupTestHouseholds`
 * in an `afterAll` block.
 *
 * Usage:
 *   import { registerTestHousehold, cleanupTestHouseholds } from "./testHelpers/cleanupRegistry";
 *
 *   afterAll(async () => {
 *     await cleanupTestHouseholds();
 *   });
 *
 *   // Inside your test setup:
 *   const { householdId } = await caller.household.create({ ... });
 *   registerTestHousehold(householdId);
 */

import { getDb } from "../db";

const registry = new Set<string>();

/** Register a household ID for cleanup after tests complete. */
export function registerTestHousehold(householdId: string) {
  registry.add(householdId);
}

/**
 * Delete all registered test households and their dependent data.
 * Safe to call multiple times — clears the registry after each run.
 */
export async function cleanupTestHouseholds() {
  if (registry.size === 0) return;

  const ids = Array.from(registry);
  registry.clear();

  const db = await getDb();
  if (!db) return;

  // Import drizzle helpers lazily to avoid circular imports at module load time
  const { inArray } = await import("drizzle-orm");
  const schema = await import("../../drizzle/schema");

  // Delete in dependency order (children before parents)
  await db.delete(schema.shadowBlocks).where(inArray(schema.shadowBlocks.householdId, ids));
  await db.delete(schema.events).where(inArray(schema.events.householdId, ids));
  await db.delete(schema.calendars).where(inArray(schema.calendars.householdId, ids));
  await db.delete(schema.verticals).where(inArray(schema.verticals.householdId, ids));
  await db.delete(schema.householdMembers).where(inArray(schema.householdMembers.householdId, ids));
  // Note: schema.householdMembers is the JS export name for the household_members table
  await db.delete(schema.households).where(inArray(schema.households.id, ids));
}
