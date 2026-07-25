import { getDb } from './server/db';
import { households, householdMembers, users } from './drizzle/schema';

async function main() {
  const db = await getDb();
  const hh = await db.select().from(households);
  console.log('HOUSEHOLDS:', JSON.stringify(hh.map(h => ({ id: h.id, name: h.name, createdBy: h.createdBy })), null, 2));
  const members = await db.select().from(householdMembers);
  console.log('MEMBERS:', JSON.stringify(members.map(m => ({ id: m.id, householdId: m.householdId, userId: m.userId, role: m.role, name: m.name })), null, 2));
  const allUsers = await db.select().from(users);
  console.log('USERS:', JSON.stringify(allUsers.map(u => ({ id: u.id, openId: u.openId, email: u.email, memberId: u.memberId })), null, 2));
}
main().catch(console.error).finally(() => process.exit(0));
