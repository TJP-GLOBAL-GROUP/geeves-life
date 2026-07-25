/**
 * sync-audit.mjs
 * Queries the live DB to produce a platform×property sync audit matrix.
 * Run: node scripts/sync-audit.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

// Load .env manually if present
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const conn = await createConnection(process.env.DATABASE_URL);

// 1. Properties
const [props] = await conn.query("SELECT id, name, isActive FROM properties ORDER BY name");
console.log("\n=== PROPERTIES ===");
for (const p of props) {
  console.log(`  ${p.isActive ? "✅" : "❌"} [${p.id}] ${p.name}`);
}

// 2. Platforms per property
const [platforms] = await conn.query(`
  SELECT pp.id, pp.propertyId, pp.platform, pp.displayName, pp.icalUrl,
         pp.isActive, pp.lastPolledAt, pp.lastError
  FROM property_platforms pp
  ORDER BY pp.propertyId, pp.platform
`);
console.log("\n=== PLATFORMS ===");
for (const pp of platforms) {
    const age = pp.lastPolledAt ? Math.round((Date.now() - new Date(pp.lastPolledAt).getTime()) / 60000) + "m ago" : "NEVER";
  console.log(`  [${pp.propertyId}] ${pp.platform} | active=${pp.isActive} | last=${age} | error=${pp.lastError || "none"}`);
}

// 3. Bookings per platform
const [bookings] = await conn.query(`
  SELECT pb.platformId, pb.bookingType, pb.guestName, pb.checkIn, pb.checkOut, pb.hasConflict, pb.icalUid, pb.blockReason
  FROM property_bookings pb
  ORDER BY pb.platformId, pb.checkIn
`);
console.log("\n=== BOOKINGS ===");
for (const b of bookings) {
  console.log(`  [${b.platformId}] ${b.bookingType} | ${b.checkIn} → ${b.checkOut} | guest=${b.guestName || "N/A"} | conflict=${b.hasConflict} | uid=${(b.icalUid || "").substring(0, 40)}`);
}

// 4. Build matrix
console.log("\n=== SYNC MATRIX ===");
const propMap = Object.fromEntries(props.map(p => [p.id, p]));
const platformsByProp = {};
for (const pp of platforms) {
  if (!platformsByProp[pp.propertyId]) platformsByProp[pp.propertyId] = [];
  platformsByProp[pp.propertyId].push(pp);
}
const bookingsByPlatform = {};
for (const b of bookings) {
  if (!bookingsByPlatform[b.platformId]) bookingsByPlatform[b.platformId] = [];
  bookingsByPlatform[b.platformId].push(b);
}

const allPlatforms = ["airbnb", "vrbo", "booking_com", "direct"];
const matrix = [];

for (const prop of props) {
  const row = { property: prop.name, propertyActive: prop.isActive };
  for (const plat of allPlatforms) {
    const pp = (platformsByProp[prop.id] || []).find(x => x.platform === plat);
    if (!pp) {
      row[plat] = "NOT_CONFIGURED";
      continue;
    }
    const bks = bookingsByPlatform[pp.id] || [];
    const blockBookings = bks.filter(b => b.bookingType === "block");
    const realBookings = bks.filter(b => b.bookingType === "booking");
    
    // Determine sync status
    let status = "OK";
    let flags = [];
    
    if (!pp.isActive) {
      status = "INACTIVE";
      // CRITICAL: if VRBO is inactive and has blocks, flag it
      if (plat === "vrbo" && blockBookings.length > 0) {
        status = "CRITICAL";
        flags.push(`VRBO_INACTIVE_WITH_${blockBookings.length}_BLOCKS`);
      }
    } else if (!pp.lastPolledAt) {
      status = "NEVER_SYNCED";
    } else if (pp.lastError) {
      status = "SYNC_ERROR";
      flags.push(pp.lastError.substring(0, 80));
    } else {
      const ageMin = (Date.now() - new Date(pp.lastPolledAt).getTime()) / 60000;
      if (ageMin > 60) {
        status = "STALE";
        flags.push(`last_sync_${Math.round(ageMin)}m_ago`);
      }
    }
    
    row[plat] = {
      status,
      flags,
      platformActive: pp.isActive,
      lastPolledAt: pp.lastPolledAt,
      lastError: pp.lastError,
      bookingCount: realBookings.length,
      blockCount: blockBookings.length,
      icalUrl: pp.icalUrl ? "SET" : "MISSING",
    };
  }
  matrix.push(row);
}

// Print matrix
for (const row of matrix) {
  console.log(`\n  Property: ${row.property} (${row.propertyActive ? "active" : "INACTIVE"})`);
  for (const plat of allPlatforms) {
    const cell = row[plat];
    if (cell === "NOT_CONFIGURED") {
      console.log(`    ${plat.padEnd(12)}: NOT_CONFIGURED`);
    } else {
      const icon = cell.status === "OK" ? "✅" : cell.status === "INACTIVE" ? "⚪" : cell.status === "CRITICAL" ? "🔴" : cell.status === "STALE" ? "🟡" : "❌";
      console.log(`    ${plat.padEnd(12)}: ${icon} ${cell.status} | bookings=${cell.bookingCount} blocks=${cell.blockCount} icalUrl=${cell.icalUrl} ${cell.flags.length ? "FLAGS: " + cell.flags.join(", ") : ""}`);
    }
  }
}

// Output JSON for use in the UI
import { writeFileSync } from "fs";
writeFileSync("/tmp/sync-matrix.json", JSON.stringify(matrix, null, 2));
console.log("\n✅ Matrix written to /tmp/sync-matrix.json");

await conn.end();
