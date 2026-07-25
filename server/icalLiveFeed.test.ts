import { describe, expect, it } from "vitest";
import { generateOutboundICSContent } from "./services/icalAggregator";

/**
 * Live iCal feed tests — the /api/ical/:propertyId.ics endpoint serves
 * generateOutboundICSContent output directly from the DB with no-cache headers.
 *
 * Root-cause context (Jul 10, 2026): the previous S3/CloudFront-hosted
 * availability.ics was cached indefinitely by the CDN (stale since Jun 25),
 * causing external platforms (Booking.com) to see weeks-old availability and
 * allow double bookings. The live endpoint eliminates the caching layer.
 */

const SUNSET_STUDIO = "Ln-_SMF7Nrt1uXsQcdP9C";
const MORABEZA = "nJnk4hr3AxZJZ-RkwhRJy";

describe("generateOutboundICSContent (live feed)", () => {
  it("produces a valid VCALENDAR for Sunset Studio", async () => {
    const ics = await generateOutboundICSContent(SUNSET_STUDIO);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
  });

  it("includes direct bookings in the Sunset Studio feed", async () => {
    const ics = await generateOutboundICSContent(SUNSET_STUDIO);
    // The Jul 9-12 2026 direct booking must be present as a BUSY block
    expect(ics).toContain("BOOKED — Direct Booking");
  });

  it("resolves platform display names (no 'Unknown platform') for Morabeza", async () => {
    const ics = await generateOutboundICSContent(MORABEZA);
    expect(ics).not.toContain("Unknown platform");
  });

  it("includes the Vrbo booking that blocks Morabeza Jul 9-12 2026", async () => {
    const ics = await generateOutboundICSContent(MORABEZA);
    expect(ics).toContain("BOOKED — Morabeza - VRBO");
  });

  it("throws for a nonexistent property", async () => {
    await expect(generateOutboundICSContent("nonexistent-property-id")).rejects.toThrow(
      /not found/i
    );
  });

  it("generates fresh DTSTAMP values on every call (not cached)", async () => {
    const ics = await generateOutboundICSContent(SUNSET_STUDIO);
    const stamp = ics.match(/DTSTAMP:(\d{8}T\d{6}Z)/)?.[1];
    expect(stamp).toBeTruthy();
    // DTSTAMP must be from today, not a stale snapshot
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(stamp!.startsWith(today)).toBe(true);
  });
});
