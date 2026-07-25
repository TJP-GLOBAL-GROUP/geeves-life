/**
 * useDeviceLocation
 *
 * Reads the device IANA timezone synchronously on mount (no permission needed).
 * Optionally requests Geolocation API for a city name (best-effort, non-blocking).
 * Persists both to the server via trpc.auth.updateDeviceLocation so server-side
 * date math (e.g. fromTs for upcoming events) always uses the user's real timezone.
 *
 * See /docs/DATETIME_MODEL.md for the full dual-timezone spec.
 */

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

/** IANA timezone string for the constellation home. Stored in household.homeTimezone. */
export const HOME_TIMEZONE = "America/New_York";

/** Returns true when the device timezone matches the home timezone. */
export function isSameAsHome(deviceTimezone: string): boolean {
  // Normalise: both America/New_York and America/Detroit are EST but different IANA strings.
  // We compare UTC offsets at the current moment for practical equivalence.
  try {
    const now = Date.now();
    const deviceOffset = new Intl.DateTimeFormat("en-US", {
      timeZone: deviceTimezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
    const homeOffset = new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_TIMEZONE,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
    return deviceOffset === homeOffset;
  } catch {
    return deviceTimezone === HOME_TIMEZONE;
  }
}

/**
 * Formats a UTC timestamp in a given IANA timezone.
 * Returns an object with { time12, time24, date, dateShort, dayName, localDateStr }.
 */
export function formatInTz(ts: number, tz: string) {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(ts);
  return {
    time12: fmt({ hour: "numeric", minute: "2-digit", hour12: true }),
    time24: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
    date: fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    dateShort: fmt({ weekday: "short", month: "short", day: "numeric" }),
    dayName: fmt({ weekday: "long" }),
    /** YYYY-MM-DD local date string — use for "is today?" comparisons */
    localDateStr: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(ts),
  };
}

/**
 * Returns midnight UTC for the start of "today" in the given timezone.
 * Use this as `fromTs` for upcoming-event queries.
 */
export function todayMidnightInTz(tz: string): number {
  const localDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(Date.now());
  // localDateStr is "YYYY-MM-DD" — parse as UTC midnight then adjust
  const [y, m, d] = localDateStr.split("-").map(Number);
  // Create a date at midnight in the target timezone by formatting and re-parsing
  const midnightLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`));
  // Use the simpler approach: find UTC ms that corresponds to 00:00 in the target tz
  // by binary-searching or using the offset
  const approx = Date.UTC(y, m - 1, d);
  // Get the offset at that approximate point
  const offsetStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  })
    .formatToParts(approx)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const offsetMatch = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3] ?? "0", 10);
    const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
    return approx - offsetMs;
  }
  return approx;
}

/** Public routes that should never trigger the device-location mutation. */
const PUBLIC_PATHS = new Set(["/", "/login", "/join", "/invitation-accept", "/privacy", "/terms"]);

export function useDeviceLocation() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const updateLocation = trpc.auth.updateDeviceLocation.useMutation();
  const hasSynced = useRef(false);
  const [location] = useLocation();

  useEffect(() => {
    // Never fire on public pages — would cause a 401 and redirect unauthenticated visitors
    if (PUBLIC_PATHS.has(location)) return;
    // Only fire when the user is authenticated
    if (!user) return;
    if (hasSynced.current) return;
    hasSynced.current = true;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Fire-and-forget: persist timezone immediately (no city yet)
    updateLocation.mutate({ timezone });

    // Best-effort geolocation for city name — non-blocking
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Reverse-geocode using browser's own timezone as city fallback
          // (We don't call an external geocoding API to avoid key requirements)
          const cityFallback = timezone.split("/").pop()?.replace(/_/g, " ") ?? "";
          updateLocation.mutate({ timezone, city: cityFallback });
        },
        () => {
          // Permission denied or unavailable — city stays as timezone city fallback
          const cityFallback = timezone.split("/").pop()?.replace(/_/g, " ") ?? "";
          updateLocation.mutate({ timezone, city: cityFallback });
        },
        { timeout: 5000, maximumAge: 300_000 }
      );
    } else {
      const cityFallback = timezone.split("/").pop()?.replace(/_/g, " ") ?? "";
      updateLocation.mutate({ timezone, city: cityFallback });
    }
  }, []);
}
