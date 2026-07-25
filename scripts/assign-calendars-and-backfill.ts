import 'dotenv/config';
import { getDb } from '../server/db';
import { calendars, events } from '../drizzle/schema';
import { inArray, eq, isNull } from 'drizzle-orm';
import { onEventUpserted } from '../server/services/eventPropagation';

const CALENDAR_IDS = [
  'TbHe_z_Hx-Yg1Q0oh3HyU', // tarik@tjperkinsfam.com — needs vertical assignment
  // Eniola's calendars excluded — Eniola is a vertical owner, no assignment needed
];
const VERTICAL_ID = 'tjpfam-vert-home';
const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';

async function run() {
  const db = await getDb();

  // Step 1: Assign vertical to the three calendars
  console.log('=== Step 1: Assigning vertical to calendars ===');
  for (const calId of CALENDAR_IDS) {
    const result = await db
      .update(calendars)
      .set({ verticalId: VERTICAL_ID })
      .where(eq(calendars.id, calId));
    console.log(`  Updated calendar ${calId} → vertical=${VERTICAL_ID}`);
  }

  // Verify
  const updated = await db
    .select({ id: calendars.id, name: calendars.name, verticalId: calendars.verticalId })
    .from(calendars)
    .where(inArray(calendars.id, CALENDAR_IDS));
  for (const c of updated) {
    console.log(`  ✓ [${c.id}] ${c.name} | vertical=${c.verticalId}`);
  }

  // Step 2: Backfill all events on these calendars
  console.log('\n=== Step 2: Backfilling events on assigned calendars ===');
  const calEvents = await db
    .select()
    .from(events)
    .where(inArray(events.calendarId, CALENDAR_IDS));
  console.log(`Found ${calEvents.length} events to propagate`);

  let processed = 0;
  let errors = 0;
  const BATCH = 10;

  for (let i = 0; i < calEvents.length; i += BATCH) {
    const batch = calEvents.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (event) => {
        try {
          await onEventUpserted(
            event.id,
            HOUSEHOLD_ID,
            { skipGoogleWrite: true },
          );
          processed++;
        } catch (err: any) {
          errors++;
          console.error(`  ERROR event ${event.id}: ${err.message}`);
        }
      })
    );
    console.log(`  Progress: ${Math.min(i + BATCH, calEvents.length)} / ${calEvents.length} (errors: ${errors})`);
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n=== Done: ${processed} events propagated, ${errors} errors ===`);
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
