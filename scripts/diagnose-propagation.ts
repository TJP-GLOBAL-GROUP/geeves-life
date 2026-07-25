/**
 * Diagnose event propagation for a specific household member.
 * Usage: pnpm tsx scripts/diagnose-propagation.ts [email]
 */
import "dotenv/config";
import { getDb } from "../server/db";
import {
  householdMembers,
  calendars,
  events,
  shadowBlocks,
  verticals,
  verticalMemberAccess,
} from "../drizzle/schema";
import { eq, and, like, gte, isNull } from "drizzle-orm";

const searchEmail = process.argv[2] || "tarik";

async function main() {
  console.log(`\n=== Propagation Diagnostic for: "${searchEmail}" ===\n`);

  // 1. Find the member
  const db = await getDb();
  const members = await db
    .select()
    .from(householdMembers)
    .where(like(householdMembers.email, `%${searchEmail}%`));

  if (members.length === 0) {
    console.log("No member found matching:", searchEmail);
    // Also try by displayName
    const byName = await db
      .select()
      .from(householdMembers)
      .where(like(householdMembers.displayName, `%${searchEmail}%`));
    if (byName.length > 0) {
      console.log("Found by name:", byName.map(m => `${m.displayName} (${m.email}) id=${m.id} household=${m.householdId}`));
    }
    process.exit(1);
  }

  const member = members[0];
  console.log(`Member: ${member.displayName} (${member.email})`);
  console.log(`  ID: ${member.id}`);
  console.log(`  Household: ${member.householdId}`);
  console.log(`  Status: ${member.status}`);
  console.log(`  Role: ${member.role}`);

  // 2. Find their calendars
  const memberCalendars = await db
    .select()
    .from(calendars)
    .where(eq(calendars.memberId, member.id));

  console.log(`\nCalendars (${memberCalendars.length}):`);
  for (const cal of memberCalendars) {
    const eventCount = await db
      .select()
          .from(events)
    .where(eq(events.calendarId, cal.id));
    console.log(`  [${cal.id}] ${cal.name} | type=${cal.calendarType} | vertical=${cal.verticalId || "NONE"} | events=${eventCount.length}`);
  }

  // 3. Find "weekend trip" events specifically
  const now = new Date();
  const futureEvents = await db
    .select()
    .from(events)
    .where(and(
      like(events.title, "%weekend%"),
      gte(events.startTime, now)
    ));

  console.log(`\n"Weekend" events in DB (all households): ${futureEvents.length}`);
  for (const ev of futureEvents) {
    console.log(`  [${ev.id}] "${ev.title}" | cal=${ev.calendarId} | start=${ev.startTime}`);
    
    // Check shadow blocks for this event
    const shadows = await db
      .select()
      .from(shadowBlocks)
      .where(eq(shadowBlocks.sourceEventId, ev.id));
    console.log(`    Shadow blocks: ${shadows.length}`);
    for (const sb of shadows) {
      console.log(`      → targetCal=${sb.targetCalendarId} | targetEvent=${sb.targetEventId}`);
    }
  }

  // 4. Check verticals for this household
  const householdVerticals = await db
    .select()
    .from(verticals)
    .where(eq(verticals.householdId, member.householdId));

  console.log(`\nVerticals in household (${householdVerticals.length}):`);
  for (const v of householdVerticals) {
    const access = await db
      .select()
      .from(verticalMemberAccess)
      .where(eq(verticalMemberAccess.verticalId, v.id));
    console.log(`  [${v.id}] ${v.name} | type=${v.type} | members with access: ${access.length}`);
    for (const a of access) {
      console.log(`    memberId=${a.memberId} calendarAccess=${a.calendarAccess}`);
    }
  }

  // 5. Check member's calendars that have NO vertical assigned
  const noVerticalCals = memberCalendars.filter(c => !c.verticalId);
  if (noVerticalCals.length > 0) {
    console.log(`\n⚠️  Calendars with NO vertical (propagation will be skipped for these):`);
    for (const cal of noVerticalCals) {
      console.log(`  [${cal.id}] ${cal.name}`);
    }
  }

  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
