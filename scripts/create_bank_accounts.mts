import { getDb } from '../server/db.ts';
import { bankAccounts } from '../drizzle/schema.ts';
import { eq } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const USER_ID = 1;

async function main() {
  const db = await getDb();

  // Get existing accounts
  const existing = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, USER_ID));
  const existingLast4s = new Set(existing.map(a => a.lastFourDigits).filter(Boolean));
  console.log('Existing last4s:', [...existingLast4s]);

  // Parse CSV for payment methods
  const csvData = readFileSync('/home/ubuntu/upload/OrderHistory.csv', 'utf-8');
  const records: any[] = parse(csvData, { columns: true, skip_empty_lines: true, bom: true });

  const paymentCards = new Map<string, { network: string; last4: string; count: number }>();
  for (const row of records) {
    const pm = (row['Payment Method Type'] || '').trim();
    if (!pm || pm === 'Not Available' || pm === 'Gift Certificate/Card') continue;
    const primary = pm.split(' and ')[0].trim();
    if (primary === 'Gift Certificate/Card') continue;
    const match = primary.match(/^(Visa|MasterCard|AmericanExpress|AmazonPLCC|Bank Account)\s*-\s*(\d+)$/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      if (!paymentCards.has(key)) paymentCards.set(key, { network: match[1], last4: match[2], count: 0 });
      paymentCards.get(key)!.count++;
    }
  }

  // Find cards not yet in bank_accounts (5+ orders)
  const newCards = [...paymentCards.entries()]
    .filter(([_, card]) => card.count >= 5 && !existingLast4s.has(card.last4));
  
  console.log(`\nCards to create (${newCards.length} with 5+ orders, not in DB):`);
  for (const [key, card] of newCards) {
    console.log(`  ${key}: ${card.count} orders`);
  }

  if (newCards.length === 0) {
    console.log('\nNo new bank accounts needed.');
    process.exit(0);
  }

  // Create them
  for (const [key, card] of newCards) {
    const networkName = card.network === 'AmericanExpress' ? 'American Express' : 
                        card.network === 'AmazonPLCC' ? 'Amazon Store Card' :
                        card.network === 'Bank Account' ? 'Bank Account' : card.network;
    const institution = card.network === 'AmericanExpress' ? 'American Express' :
                        card.network === 'AmazonPLCC' ? 'Synchrony Bank' :
                        card.network === 'Bank Account' ? 'Unknown Bank' : 'Unknown Bank';
    const accountType = card.network === 'Bank Account' ? 'checking' as const : 'credit_card' as const;
    
    await db.insert(bankAccounts).values({
      userId: USER_ID,
      institution,
      accountName: `${networkName} ****${card.last4}`,
      accountType,
      category: 'personal',
      currency: 'USD',
      lastFourDigits: card.last4,
      isActive: true,
    });
    console.log(`  Created: ${networkName} ****${card.last4}`);
  }

  // Also create Amazon Gift Card / Points Balance account
  const hasGiftCard = existing.some(a => a.accountName.includes('Gift'));
  if (!hasGiftCard) {
    await db.insert(bankAccounts).values({
      userId: USER_ID,
      institution: 'Amazon',
      accountName: 'Amazon Gift Card / Points Balance',
      accountType: 'checking',
      category: 'personal',
      currency: 'USD',
      lastFourDigits: null,
      isActive: true,
    });
    console.log('  Created: Amazon Gift Card / Points Balance');
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
