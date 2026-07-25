/**
 * DATA CLASSIFICATION REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Central manifest that maps every sensitive database field to one or more
 * data categories. The enforcement layer (`stripByPolicy`) reads this registry
 * at runtime, so:
 *
 *   • Adding a new category  → add it to DATA_CATEGORIES below
 *   • Classifying a new field → add it to FIELD_CLASSIFICATIONS below
 *   • No changes needed in routers or procedures
 *
 * Categories are stored in `vertical_data_policies.dataCategory` and evaluated
 * by `isMemberRestrictedFromDataCategory` in db.ts.
 *
 * EXTENDING:
 *   1. Add the new category string to DATA_CATEGORIES.
 *   2. Add field entries to FIELD_CLASSIFICATIONS with the new category.
 *   3. The Super Admin → Data Classification tab will automatically show it.
 *   4. Admins can create a `vertical_data_policies` row for the new category.
 */

// ─── Category Definitions ────────────────────────────────────────────────────

export const DATA_CATEGORIES = [
  "financial",      // Revenue, commission, net payout, pricing
  "private",        // Personal notes, private calendar events, internal memos
  "guest_pii",      // Guest name, email, phone, passport, address
  "operational",    // Internal operational data: prep schedules, staff notes
  "health",         // Health/medical information (future: caregiver vertical)
  "legal",          // Legal documents, contracts, dispute records
  "credentials",    // Passwords, API keys, access tokens (never exposed to members)
] as const;

export type DataCategory = typeof DATA_CATEGORIES[number];

// ─── Field Classification Entry ──────────────────────────────────────────────

export interface FieldClassification {
  /** Database table name (snake_case, matches Drizzle schema) */
  table: string;
  /** Field name (snake_case, matches Drizzle column) */
  field: string;
  /** One or more data categories this field belongs to */
  categories: DataCategory[];
  /** Human-readable description of what this field contains */
  description: string;
  /**
   * Replacement value when the field is stripped.
   * - null  → field is set to null
   * - "REDACTED" → string placeholder
   * - 0     → numeric zero
   * - false → boolean false
   * Defaults to null.
   */
  redactedValue?: null | string | number | boolean;
}

// ─── Master Field Classification Manifest ────────────────────────────────────
// Add new entries here. Order within a table is cosmetic only.

export const FIELD_CLASSIFICATIONS: FieldClassification[] = [
  // ── property_bookings ──────────────────────────────────────────────────────
  { table: "property_bookings", field: "totalPrice",       categories: ["financial"],  description: "Total booking price charged to guest",         redactedValue: null },
  { table: "property_bookings", field: "commissionAmount", categories: ["financial"],  description: "Platform commission deducted from total price", redactedValue: null },
  { table: "property_bookings", field: "netAmount",        categories: ["financial"],  description: "Net payout to host after commission",           redactedValue: null },
  { table: "property_bookings", field: "currency",         categories: ["financial"],  description: "Currency code for financial fields",            redactedValue: null },
  { table: "property_bookings", field: "guestName",        categories: ["guest_pii"],  description: "Full name of the guest",                        redactedValue: "Guest" },
  { table: "property_bookings", field: "guestEmail",       categories: ["guest_pii"],  description: "Guest email address",                           redactedValue: null },
  { table: "property_bookings", field: "guestPhone",       categories: ["guest_pii"],  description: "Guest phone number",                            redactedValue: null },
  { table: "property_bookings", field: "confirmationNumber", categories: ["guest_pii"], description: "Platform booking confirmation number",          redactedValue: null },
  { table: "property_bookings", field: "rawEmailBody",     categories: ["guest_pii", "private"], description: "Raw email body from scraping — may contain PII", redactedValue: null },

  // ── properties ─────────────────────────────────────────────────────────────
  { table: "properties", field: "purchasePrice",    categories: ["financial", "private"], description: "Property purchase price",                   redactedValue: null },
  { table: "properties", field: "currentValue",     categories: ["financial", "private"], description: "Estimated current market value",             redactedValue: null },
  { table: "properties", field: "mortgageBalance",  categories: ["financial", "private"], description: "Outstanding mortgage balance",               redactedValue: null },
  { table: "properties", field: "monthlyMortgage",  categories: ["financial", "private"], description: "Monthly mortgage payment",                   redactedValue: null },
  { table: "properties", field: "rentalRate",       categories: ["financial"],            description: "Nightly or monthly rental rate",             redactedValue: null },
  { table: "properties", field: "managementFee",    categories: ["financial"],            description: "Property management fee percentage",         redactedValue: null },
  { table: "properties", field: "ownerNotes",       categories: ["private"],              description: "Private owner notes not visible to guests",  redactedValue: null },
  { table: "properties", field: "accessCode",       categories: ["credentials", "private"], description: "Property access/lock code",               redactedValue: "****" },
  { table: "properties", field: "wifiPassword",     categories: ["credentials"],          description: "WiFi password for the property",             redactedValue: "****" },

  // ── bank_accounts ──────────────────────────────────────────────────────────
  { table: "bank_accounts", field: "accountNumber",  categories: ["financial", "credentials"], description: "Bank account number",                  redactedValue: "****" },
  { table: "bank_accounts", field: "routingNumber",  categories: ["financial", "credentials"], description: "Bank routing number",                  redactedValue: "****" },
  { table: "bank_accounts", field: "balance",        categories: ["financial"],                description: "Current account balance",              redactedValue: null },
  { table: "bank_accounts", field: "accountName",    categories: ["financial", "private"],     description: "Account holder name",                  redactedValue: null },

  // ── transactions ───────────────────────────────────────────────────────────
  { table: "transactions", field: "amount",          categories: ["financial"],  description: "Transaction amount",                                  redactedValue: null },
  { table: "transactions", field: "balance",         categories: ["financial"],  description: "Account balance after transaction",                   redactedValue: null },
  { table: "transactions", field: "description",     categories: ["financial", "private"], description: "Transaction description/memo",             redactedValue: null },
  { table: "transactions", field: "merchantName",    categories: ["financial"],  description: "Merchant or payee name",                              redactedValue: null },

  // ── events (calendar) ──────────────────────────────────────────────────────
  { table: "events", field: "title",       categories: ["private"],   description: "Event title — may contain sensitive info",  redactedValue: "Busy" },
  { table: "events", field: "description", categories: ["private"],   description: "Event description/notes",                   redactedValue: null },
  { table: "events", field: "location",   categories: ["private"],    description: "Event location",                            redactedValue: null },
  { table: "events", field: "attendees",  categories: ["private", "guest_pii"], description: "Event attendees list",            redactedValue: null },
  { table: "events", field: "meetLink",   categories: ["credentials", "private"], description: "Video call link",               redactedValue: null },

  // ── notes ──────────────────────────────────────────────────────────────────
  { table: "notes", field: "content",     categories: ["private"],    description: "Note body content",                         redactedValue: null },
  { table: "notes", field: "title",       categories: ["private"],    description: "Note title",                                redactedValue: "Private Note" },

  // ── household_members ──────────────────────────────────────────────────────
  { table: "household_members", field: "email",       categories: ["guest_pii", "private"], description: "Member email address",           redactedValue: null },
  { table: "household_members", field: "phone",       categories: ["guest_pii", "private"], description: "Member phone number",            redactedValue: null },
  { table: "household_members", field: "dateOfBirth", categories: ["private", "health"],    description: "Member date of birth",           redactedValue: null },
  { table: "household_members", field: "address",     categories: ["private", "guest_pii"], description: "Member home address",            redactedValue: null },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

/**
 * Returns all field classifications for a given table.
 */
export function getTableClassifications(table: string): FieldClassification[] {
  return FIELD_CLASSIFICATIONS.filter(f => f.table === table);
}

/**
 * Returns the set of fields in a table that belong to any of the given categories.
 * Used by stripByPolicy to know which fields to redact.
 */
export function getRestrictedFields(
  table: string,
  restrictedCategories: DataCategory[]
): Map<string, null | string | number | boolean> {
  const catSet = new Set(restrictedCategories);
  const result = new Map<string, null | string | number | boolean>();
  for (const entry of FIELD_CLASSIFICATIONS) {
    if (entry.table !== table) continue;
    if (entry.categories.some(c => catSet.has(c))) {
      result.set(entry.field, entry.redactedValue ?? null);
    }
  }
  return result;
}

/**
 * Strips restricted fields from a single record object.
 * Returns a new object — does not mutate the original.
 *
 * @param record        The raw DB row or response object
 * @param table         The table name (used to look up classifications)
 * @param restrictedCats The categories that should be redacted for this viewer
 */
export function stripByPolicy<T extends Record<string, unknown>>(
  record: T,
  table: string,
  restrictedCats: DataCategory[]
): T {
  if (!restrictedCats.length) return record;
  const restricted = getRestrictedFields(table, restrictedCats);
  if (!restricted.size) return record;
  const result = { ...record };
  restricted.forEach((redactedValue, field) => {
    if (field in result) {
      (result as Record<string, unknown>)[field] = redactedValue;
    }
  });
  return result;
}

/**
 * Strips restricted fields from an array of records.
 */
export function stripArrayByPolicy<T extends Record<string, unknown>>(
  records: T[],
  table: string,
  restrictedCats: DataCategory[]
): T[] {
  if (!restrictedCats.length) return records;
  return records.map(r => stripByPolicy(r, table, restrictedCats));
}

/**
 * Given a member's restricted categories (from vertical_data_policies),
 * returns which DATA_CATEGORIES they are blocked from for a specific vertical.
 *
 * This is a convenience wrapper — the actual DB check is in isMemberRestrictedFromDataCategory.
 * Use this when you want to batch-check all categories at once.
 */
export async function resolveRestrictedCategories(opts: {
  memberId: string;
  verticalId: string;
  memberRole: string;
  checkCategories?: DataCategory[];
  isMemberRestricted: (opts: { memberId: string; verticalId: string; memberRole: string; dataCategory: DataCategory }) => Promise<boolean>;
}): Promise<DataCategory[]> {
  const toCheck = opts.checkCategories ?? [...DATA_CATEGORIES];
  const results = await Promise.all(
    toCheck.map(async cat => {
      const restricted = await opts.isMemberRestricted({
        memberId: opts.memberId,
        verticalId: opts.verticalId,
        memberRole: opts.memberRole,
        dataCategory: cat,
      });
      return restricted ? cat : null;
    })
  );
  return results.filter((c): c is DataCategory => c !== null);
}
