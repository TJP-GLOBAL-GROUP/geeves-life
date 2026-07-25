/**
 * Date utility functions for Geeves.Life
 *
 * TIMEZONE RULE (enforced throughout the codebase):
 * - All event timestamps are stored as UTC milliseconds (Unix epoch).
 * - When converting a Date object to a YYYY-MM-DD string for URL params, form
 *   defaults, or display labels, ALWAYS use toLocalDateString() or the
 *   localDateISO() helper below — NEVER date.toISOString().split("T")[0].
 *
 * Rationale: toISOString() converts to UTC before formatting. A user in Lagos
 * (UTC+1) clicking on July 8th at 00:00 local time gets a Date whose UTC value
 * is July 7th 23:00, so toISOString() returns "2026-07-07" — the wrong day.
 */

/**
 * Convert a Date to a YYYY-MM-DD string using the **local** calendar date.
 * Safe for all timezones — positive (Lagos UTC+1) and negative (New York UTC-5).
 */
export function localDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string as LOCAL midnight (not UTC midnight).
 * new Date("2026-07-08") is treated as UTC midnight by the JS spec, which
 * in negative-UTC-offset zones (EDT, PDT) becomes the previous evening.
 * Use this helper everywhere a date-only string needs to become a Date.
 */
export function parseLocalDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match) return new Date(+match[1], +match[2] - 1, +match[3]);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Returns today's date as a YYYY-MM-DD string in the local timezone.
 * Replaces: new Date().toISOString().split("T")[0]
 */
export function todayISO(): string {
  return localDateISO(new Date());
}
