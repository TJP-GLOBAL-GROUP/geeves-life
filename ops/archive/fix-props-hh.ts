import { getDb } from "./server/db";
import { properties, households, propertyBookings, propertyPlatforms, propertyPrepRules } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const OLD_HH = "V8lk3KJatvxBTWURf4uo9";
const NEW_HH = "YouIQoAP6nmcPNljVdUis";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }
  
  // Check the old household
  const oldHH = await db.select().from(households).where(eq(households.id, OLD_HH)).limit(1);
  console.log("OLD HH:", JSON.stringify(oldHH[0] || null));
  
  // Check properties under old household
  const props = await db.select({ id: properties.id, name: properties.name }).from(properties).where(eq(properties.householdId, OLD_HH));
  console.log("PROPERTIES TO MIGRATE:", props.map(p => `${p.name} (${p.id})`));
  
  // Migrate properties
  const r1 = await db.update(properties).set({ householdId: NEW_HH }).where(eq(properties.householdId, OLD_HH));
  console.log("Properties migrated:", r1);
  
  // Migrate property bookings
  const propIds = props.map(p => p.id);
  for (const propId of propIds) {
    const r2 = await db.update(propertyBookings).set({ householdId: NEW_HH }).where(eq(propertyBookings.propertyId, propId));
    console.log(`Bookings for ${propId} migrated`);
  }
  
  // Migrate property platforms
  for (const propId of propIds) {
    await db.update(propertyPlatforms).set({ householdId: NEW_HH }).where(eq(propertyPlatforms.propertyId, propId));
    console.log(`Platforms for ${propId} migrated`);
  }
  
  console.log("DONE");
}
main().catch(console.error).finally(() => process.exit(0));
