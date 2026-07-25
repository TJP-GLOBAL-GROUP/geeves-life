import { getDb } from './server/db';
import { households, householdMembers } from './drizzle/schema';
import { like, or, eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  // Find households with "perkins" or "TJ" in name
  const hh = await db.select().from(households);
  const relevant = hh.filter(h => 
    h.name?.toLowerCase().includes('perkins') || 
    h.name?.toLowerCase().includes('tj') ||
    h.id === 'YouIQoAP6nmcPNljVdUis'
  );
  console.log('RELEVANT HOUSEHOLDS:', JSON.stringify(relevant.map(h => ({ id: h.id, name: h.name, createdBy: h.createdBy })), null, 2));
  
  // Find members for user IDs 1, 1410001, 3510145, 3933106
  const members = await db.select().from(householdMembers);
  const myMembers = members.filter(m => 
    [1, 1410001, 3510145, 3933106].includes(m.userId as number) ||
    m.householdId === 'YouIQoAP6nmcPNljVdUis'
  );
  console.log('MY MEMBERS:', JSON.stringify(myMembers.map(m => ({ id: m.id, householdId: m.householdId, userId: m.userId, role: m.role, name: m.name })), null, 2));
  
  // Show what household the properties are in
  console.log('\nProperties are in household: YouIQoAP6nmcPNljVdUis');
  const hhForProps = hh.find(h => h.id === 'YouIQoAP6nmcPNljVdUis');
  console.log('That household:', JSON.stringify(hhForProps, null, 2));
}
main().catch(console.error).finally(() => process.exit(0));
