/**
 * Direct ICS regeneration script — calls generateOutboundICS service directly.
 * Run: npx tsx scripts/regen-ics-direct.ts
 */
import { generateOutboundICS } from "../server/services/icalAggregator";
import { getDb } from "../server/db";
import { properties } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PROPERTY_IDS = [
  "ZI2Zy7OuLGYF-vmWOAII-", // The Artiste's Boutique (JM, blockSundays=true)
  "Ln-_SMF7Nrt1uXsQcdP9C", // Sunset Studio (US, blockSundays=true, blockNationalHolidays=true)
  "nJnk4hr3AxZJZ-RkwhRJy", // Morabeza (US, blockSundays=true, blockNationalHolidays=true)
  "8W4U2WJg6d4rDN9v7I8-Z", // Apartment #1 (US, no prep rules)
  "RsUUOvqGAX3TgASRzDbGJ", // Apartment #2 (US, no prep rules)
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DB not available");
    process.exit(1);
  }

  for (const propertyId of PROPERTY_IDS) {
    const [prop] = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, propertyId)).limit(1);
    const name = prop?.name ?? propertyId;
    process.stdout.write(`Regenerating ICS for ${name}... `);
    try {
      const url = await generateOutboundICS(propertyId);
      // Save URL back to properties table
      await db.update(properties).set({ outboundIcsUrl: url }).where(eq(properties.id, propertyId));
      console.log(`✓\n  URL: ${url}`);
    } catch (err) {
      console.log(`✗\n  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
