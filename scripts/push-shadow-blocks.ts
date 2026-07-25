/**
 * push-shadow-blocks.ts
 * 
 * Pushes all existing DB shadow blocks that have no externalEventId to Google Calendar.
 * This fixes the case where shadow blocks were written to DB but never pushed to Google
 * because the source calendar's memberId had no OAuth token.
 * 
 * Run: npx tsx scripts/push-shadow-blocks.ts
 */
import { createConnection } from "mysql2/promise";
import { createGoogleEvent } from "../server/services/googleCalendarSync";
import { getAccessTokenForCalendar } from "../server/services/calendarWebhook";

const HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9";
const BATCH_SIZE = 20;
const DELAY_MS = 200; // rate limit buffer

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL!);

  // Get all shadow blocks with no externalEventId, joined with target calendar info
  const [blocks] = await conn.execute(
    `SELECT sb.id, sb.sourceEventId, sb.targetCalendarId, sb.maskedTitle,
            e.startTime, e.endTime, e.isAllDay, e.description,
            c.externalId as targetExternalCalId, c.memberId as targetMemberId, c.accountEmail
     FROM shadow_blocks sb
     JOIN events e ON e.id = sb.sourceEventId
     JOIN calendars c ON c.id = sb.targetCalendarId
     WHERE sb.externalEventId IS NULL
       AND e.householdId = ?
       AND c.externalId IS NOT NULL
       AND e.startTime > UNIX_TIMESTAMP(NOW() - INTERVAL 90 DAY) * 1000
     ORDER BY e.startTime DESC
     LIMIT 2000`,
    [HOUSEHOLD_ID]
  ) as any[];

  console.log(`Found ${blocks.length} shadow blocks to push to Google Calendar`);

  let pushed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    
    for (const block of batch) {
      try {
        const accessToken = await getAccessTokenForCalendar(block.targetCalendarId, block.targetMemberId);
        if (!accessToken) {
          console.warn(`  ⚠ No token for calendar ${block.targetCalendarId} (${block.accountEmail}) — skipping`);
          skipped++;
          continue;
        }

        const startMs = Number(block.startTime);
        const endMs = Number(block.endTime);

        let start: any, end: any;
        if (block.isAllDay) {
          const startDate = new Date(startMs).toISOString().split("T")[0];
          const endDate = new Date(endMs).toISOString().split("T")[0];
          start = { date: startDate };
          end = { date: endDate };
        } else {
          start = { dateTime: new Date(startMs).toISOString() };
          end = { dateTime: new Date(endMs).toISOString() };
        }

        const gEvent = await createGoogleEvent(accessToken, block.targetExternalCalId, {
          summary: block.maskedTitle || "Busy",
          description: "Geeves shadow block",
          start,
          end,
          transparency: "opaque",
          visibility: "private",
        });

        // Update the DB record with the Google event ID
        await conn.execute(
          "UPDATE shadow_blocks SET externalEventId = ? WHERE id = ?",
          [gEvent.id, block.id]
        );

        pushed++;
        if (pushed % 50 === 0) {
          console.log(`  Progress: ${pushed} pushed, ${failed} failed, ${skipped} skipped`);
        }
      } catch (e: any) {
        console.warn(`  ✗ Failed to push shadow block ${block.id}: ${e.message}`);
        failed++;
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Done: ${pushed} pushed to Google Calendar, ${failed} failed, ${skipped} skipped (no token)`);
  await conn.end();
}

main().catch(console.error);
