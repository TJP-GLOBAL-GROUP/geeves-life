import { getDb } from "./server/db";
import { households, householdMembers, users, properties } from "./drizzle/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Show both households with their creators
  const hh1 = await db.select().from(households).where(eq(households.id, "V8lk3KJatvxBTWURf4uo9")).limit(1);
  const hh2 = await db.select().from(households).where(eq(households.id, "YouIQoAP6nmcPNljVdUis")).limit(1);
  
  console.log("=== TJ Perkins Global (V8lk3KJatvxBTWURf4uo9) ===");
  console.log("createdByUserId:", hh1[0]?.createdByUserId);
  
  console.log("\n=== TJ Perkins Fam (YouIQoAP6nmcPNljVdUis) ===");
  console.log("createdByUserId:", hh2[0]?.createdByUserId);
  
  // Show all users
  const allUsers = await db.select().from(users);
  console.log("\n=== ALL USERS ===");
  for (const u of allUsers) {
    console.log(`  id=${u.id} | openId=${u.openId} | email=${u.email} | memberId=${u.memberId}`);
  }
  
  // Show members in each household
  const members1 = await db.select().from(householdMembers).where(eq(householdMembers.householdId, "V8lk3KJatvxBTWURf4uo9"));
  const members2 = await db.select().from(householdMembers).where(eq(householdMembers.householdId, "YouIQoAP6nmcPNljVdUis"));
  
  console.log("\n=== Members of TJ Perkins Global ===");
  for (const m of members1) {
    console.log(`  memberId=${m.id} | userId=${m.userId} | role=${m.role} | name=${m.name} | status=${m.status}`);
  }
  
  console.log("\n=== Members of TJ Perkins Fam ===");
  for (const m of members2) {
    console.log(`  memberId=${m.id} | userId=${m.userId} | role=${m.role} | name=${m.name} | status=${m.status}`);
  }
  
  // Show properties
  const props = await db.select({ id: properties.id, name: properties.name, householdId: properties.householdId }).from(properties);
  console.log("\n=== ALL PROPERTIES ===");
  for (const p of props) {
    console.log(`  ${p.name} → householdId=${p.householdId}`);
  }
}
main().catch(console.error).finally(() => process.exit(0));
