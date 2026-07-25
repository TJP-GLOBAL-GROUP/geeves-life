import type { Request, Response } from "express";
import { getDb } from "../db";
import { propertyBookings, properties } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { generateOutboundICS } from "../services/icalAggregator";
import { queueIcsRegeneration } from "../services/icsRegenerationQueue";

/**
 * POST /api/scheduled/ics-reconcile
 * Admin-only: Run ICS reconciliation for all properties.
 * Checks if outbound ICS matches current DB state and regenerates if stale.
 */
export async function icsReconcileHandler(req: Request, res: Response) {
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "DB not available" });

  const allProperties = await db.select().from(properties);
  const results: Array<{ property: string; propertyId: string; status: string; issue?: string }> = [];
  let regenerated = 0;

  for (const property of allProperties) {
    try {
      // Get confirmed bookings from DB
      const bookings = await db
        .select({ checkIn: propertyBookings.checkIn, checkOut: propertyBookings.checkOut })
        .from(propertyBookings)
        .where(
          and(
            eq(propertyBookings.propertyId, property.id),
            eq(propertyBookings.bookingStatus, "confirmed")
          )
        );

      // Check if outbound ICS URL exists
      if (!property.outboundIcsUrl) {
        // No ICS at all — generate one immediately
        try {
          await generateOutboundICS(property.id);
          results.push({ property: property.name, propertyId: property.id, status: "GENERATED (was missing)" });
          regenerated++;
        } catch (genErr) {
          results.push({ property: property.name, propertyId: property.id, status: "ERROR", issue: `No ICS URL and generation failed: ${(genErr as Error).message}` });
        }
        continue;
      }

      // For live endpoint URLs, just verify the content is correct by generating fresh
      if (property.outboundIcsUrl.includes("/api/ical/")) {
        // Live endpoint — always fresh, just verify it would generate correctly
        try {
          const content = await generateOutboundICS(property.id);
          const bookingEventCount = (content.match(/BOOKED/g) || []).length;
          if (bookings.length > 0 && bookingEventCount === 0) {
            results.push({
              property: property.name,
              propertyId: property.id,
              status: "WARNING",
              issue: `${bookings.length} confirmed bookings in DB but 0 BOOKED events in generated ICS`,
            });
          } else {
            results.push({
              property: property.name,
              propertyId: property.id,
              status: "OK",
              issue: `${bookings.length} bookings, ${bookingEventCount} ICS events (live endpoint)`,
            });
          }
        } catch (genErr) {
          results.push({
            property: property.name,
            propertyId: property.id,
            status: "ERROR",
            issue: `Live endpoint generation failed: ${(genErr as Error).message}`,
          });
        }
        continue;
      }

      // For S3-hosted URLs, check if the file is accessible and fresh
      try {
        const icsResp = await fetch(property.outboundIcsUrl, { signal: AbortSignal.timeout(10000) });
        if (!icsResp.ok) {
          await queueIcsRegeneration(property.id, `ICS inaccessible: HTTP ${icsResp.status}`);
          results.push({ property: property.name, propertyId: property.id, status: "QUEUED (inaccessible)", issue: `HTTP ${icsResp.status}` });
          regenerated++;
          continue;
        }

        const icsText = await icsResp.text();
        const hasBookingEvents = icsText.includes("BOOKED");

        if (bookings.length > 0 && !hasBookingEvents) {
          await queueIcsRegeneration(property.id, "ICS missing booking events");
          results.push({ property: property.name, propertyId: property.id, status: "QUEUED (missing bookings)", issue: `${bookings.length} confirmed bookings not in ICS` });
          regenerated++;
          continue;
        }

        results.push({ property: property.name, propertyId: property.id, status: "OK", issue: `${bookings.length} bookings` });
      } catch (fetchErr) {
        await queueIcsRegeneration(property.id, `ICS fetch error: ${(fetchErr as Error).message}`);
        results.push({ property: property.name, propertyId: property.id, status: "QUEUED (fetch error)", issue: (fetchErr as Error).message });
        regenerated++;
      }
    } catch (err) {
      results.push({ property: property.name, propertyId: property.id, status: "ERROR", issue: (err as Error).message });
    }
  }

  return res.json({
    ok: true,
    propertiesChecked: allProperties.length,
    regenerated,
    results,
    timestamp: new Date().toISOString(),
  });
}
