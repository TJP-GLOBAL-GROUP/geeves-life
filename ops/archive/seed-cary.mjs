/**
 * Seed script: Create Cary as a household_member in TJ Perkins Global
 * with restricted access to Bohemian Lodges vertical only.
 *
 * Access rules:
 * - Vertical access: Bohemian Lodges only, read_only, availability_only calendar access
 * - Financial data: hidden (vertical_data_policies)
 * - Guest PII: hidden (vertical_data_policies)
 * - Can request meetings: true
 *
 * Run: node scripts/seed-cary.mjs
 */
import { createConnection } from "mysql2/promise";
import { randomBytes } from "crypto";

const nanoid = (size = 21) => randomBytes(size).toString("base64url").slice(0, size);
const toMysqlDatetime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const db = await createConnection(process.env.DATABASE_URL);

// ─── 1. Find TJ Perkins Global household ────────────────────────────────────
const [households] = await db.query(
  "SELECT id, name FROM households WHERE name LIKE '%Global%' OR name LIKE '%Perkins%' LIMIT 5"
);
console.log("Households found:", households);

// Use TJ Perkins Global (the tjperkinsfam.com account household)
const household = households.find(h => h.name.includes("Global")) || households[0];
if (!household) { console.error("No household found"); process.exit(1); }
console.log("Using household:", household.id, household.name);

// ─── 2. Find Bohemian Lodges vertical ───────────────────────────────────────
const [verticals] = await db.query(
  "SELECT id, name FROM verticals WHERE householdId = ? AND name LIKE '%Bohemian%'",
  [household.id]
);
console.log("Verticals found:", verticals);
const vertical = verticals[0];
if (!vertical) { console.error("Bohemian Lodges vertical not found"); process.exit(1); }
console.log("Using vertical:", vertical.id, vertical.name);

// ─── 3. Check if Cary already exists ────────────────────────────────────────
const [existing] = await db.query(
  "SELECT id, displayName, email FROM household_members WHERE householdId = ? AND (displayName LIKE '%Cary%' OR email LIKE '%cary%')",
  [household.id]
);
let caryMemberId;
if (existing.length > 0) {
  caryMemberId = existing[0].id;
  console.log("Cary already exists:", caryMemberId, existing[0].displayName);
} else {
  // ─── 4. Create Cary as a household_member ─────────────────────────────────
  caryMemberId = nanoid();
  const now = toMysqlDatetime(Date.now());
  await db.query(
    `INSERT INTO household_members
       (id, householdId, displayName, email, role, status, inviteToken, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caryMemberId,
      household.id,
      "Cary",
      "cary@bohemianlodges.com",
      "member",
      "invited",
      nanoid(32),
      now,
      now,
    ]
  );
  console.log("Created Cary member:", caryMemberId);
}

// ─── 5. Upsert vertical_member_access ───────────────────────────────────────
const [existingAccess] = await db.query(
  "SELECT id FROM vertical_member_access WHERE memberId = ? AND verticalId = ?",
  [caryMemberId, vertical.id]
);

const accessId = existingAccess.length > 0 ? existingAccess[0].id : nanoid();
const now2 = toMysqlDatetime(Date.now());

if (existingAccess.length > 0) {
  await db.query(
    `UPDATE vertical_member_access
     SET accessLevel = ?, calendarAccess = ?, allowedCalendarIds = ?, canRequestMeetings = ?, updatedAt = ?
     WHERE id = ?`,
    ["read_only", "availability_only", JSON.stringify([]), true, now2, accessId]
  );
  console.log("Updated vertical_member_access:", accessId);
} else {
  await db.query(
    `INSERT INTO vertical_member_access
       (id, householdId, memberId, verticalId, accessLevel, calendarAccess, allowedCalendarIds, canRequestMeetings, configuredByMemberId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accessId,
      household.id,
      caryMemberId,
      vertical.id,
      "read_only",
      "availability_only",
      JSON.stringify([]),
      true,
      null,
      now2,
      now2,
    ]
  );
  console.log("Created vertical_member_access:", accessId);
}

// ─── 6. Upsert vertical_data_policies for financial + guest_pii ─────────────
const dataCategories = ["financial", "guest_pii"];
for (const category of dataCategories) {
  const [existingPolicy] = await db.query(
  "SELECT id FROM vertical_data_policies WHERE verticalId = ? AND dataCategory = ?",
  [vertical.id, category]
  );

  if (existingPolicy.length > 0) {
    // Ensure Cary's member ID is in hidden_from_member_ids
    const policy = existingPolicy[0];
    const [fullPolicy] = await db.query(
      "SELECT hiddenFromMemberIds FROM vertical_data_policies WHERE id = ?",
      [policy.id]
    );
    let hiddenIds = [];
    try { hiddenIds = JSON.parse(fullPolicy[0].hiddenFromMemberIds || "[]"); } catch {}
    if (!hiddenIds.includes(caryMemberId)) {
      hiddenIds.push(caryMemberId);
      await db.query(
        "UPDATE vertical_data_policies SET hiddenFromMemberIds = ?, updatedAt = ? WHERE id = ?",
        [JSON.stringify(hiddenIds), toMysqlDatetime(Date.now()), policy.id]
      );
    }
    console.log(`Updated ${category} policy to include Cary`);
  } else {
    const policyId = nanoid();
    const now3 = toMysqlDatetime(Date.now());
    await db.query(
      `INSERT INTO vertical_data_policies
         (id, householdId, verticalId, dataCategory, hiddenFromRoles, hiddenFromMemberIds, configuredByMemberId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        policyId,
        household.id,
        vertical.id,
        category,
        JSON.stringify([]),
        JSON.stringify([caryMemberId]),
        null,
        now3,
        now3,
      ]
    );
    console.log(`Created ${category} data policy:`, policyId);
  }
}

// ─── 7. Summary ─────────────────────────────────────────────────────────────
console.log("\n✅ Cary setup complete:");
console.log("  Member ID:", caryMemberId);
console.log("  Household:", household.name, "(", household.id, ")");
console.log("  Vertical access:", vertical.name, "— read_only, availability_only calendar");
console.log("  Data policies: financial + guest_pii hidden for Cary");
console.log("  Status: invited (pending acceptance)");
console.log("\n  Next step: update cary@bohemianlodges.com to Cary's real email,");
console.log("  then send the invite from the Household Members page.");

await db.end();
