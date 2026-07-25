/**
 * Seed Chart of Accounts
 * 
 * Populates the chart_of_accounts table with proper expense categories
 * organized by vertical. These replace the hardcoded category strings
 * in the categorization tool.
 * 
 * Schema: chart_of_accounts
 *   id (varchar 21), householdId, verticalId, accountNumber, name, 
 *   accountType (expense|income|asset|liability|equity|cogs),
 *   parentId, description, qboAccountId, qboFullyQualifiedName, qboSyncStatus,
 *   isActive, isDefault, isSystemAccount, isTaxRelevant, taxFormLine, taxJurisdiction,
 *   createdAt, updatedAt, createdBy
 */

import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

const HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9';

function nanoid(size = 21) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  const bytes = randomBytes(size);
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

// Verticals mapping
const VERTICALS = {
  home: { id: 'tjpfam-vert-home', name: 'Home & Family', prefix: 'HF' },
  bakery: { id: 'tjpfam-vert-bakery', name: 'Maxfield Bakery', prefix: 'MB' },
  market: { id: 'tjpfam-vert-market', name: 'Maxfield Market', prefix: 'MM' },
  personal: { id: 'tjpfam-vert-self', name: 'Personal', prefix: 'PS' },
  startout: { id: 'tjpfam-vert-startout', name: 'StartOut', prefix: 'SO' },
  bohemian: { id: 'c3pW-Cxhm9WAQZ17pTMb3', name: 'Bohemian Lodges', prefix: 'BL' },
};

// Chart of accounts by vertical
// Each entry: [accountNumber, name, accountType, description, isTaxRelevant, taxFormLine, taxJurisdiction, parentKey]
const ACCOUNTS = {
  home: [
    // Expenses
    ['HF-5010', 'Mortgage/Rent', 'expense', 'Monthly mortgage or rent payments', true, 'Schedule A', 'us_federal', null],
    ['HF-5020', 'Property Tax', 'expense', 'Annual property tax payments', true, 'Schedule A', 'us_federal', null],
    ['HF-5030', 'Home Insurance', 'expense', 'Homeowner or renter insurance premiums', false, null, null, null],
    ['HF-5040', 'Maintenance & Repairs', 'expense', 'Home maintenance, repairs, and upkeep', false, null, null, null],
    ['HF-5050', 'Utilities', 'expense', 'Electric, gas, water, internet, phone', false, null, null, null],
    ['HF-5060', 'Furnishings', 'expense', 'Furniture, decor, and household items', false, null, null, null],
    ['HF-5070', 'Groceries', 'expense', 'Food and household consumables', false, null, null, null],
    ['HF-5080', 'Childcare & Education', 'expense', 'Daycare, school fees, tutoring, supplies', true, 'Form 2441', 'us_federal', null],
    ['HF-5090', 'Family Activities', 'expense', 'Entertainment, outings, family events', false, null, null, null],
    ['HF-5100', 'Pet Care', 'expense', 'Veterinary, food, grooming, supplies', false, null, null, null],
    ['HF-5110', 'Auto Maintenance & Repair', 'expense', 'Vehicle maintenance, repairs, gas', false, null, null, null],
    ['HF-5120', 'Credit Card Interest', 'expense', 'Interest charges on credit cards', false, null, null, null],
    ['HF-5130', 'Bank Fees', 'expense', 'Account fees, overdraft charges, wire fees', false, null, null, null],
    ['HF-5140', 'Travel & Mileage', 'expense', 'Family travel, vacation, mileage', false, null, null, null],
    ['HF-5150', 'Healthcare', 'expense', 'Medical, dental, vision, prescriptions', true, 'Schedule A', 'us_federal', null],
    ['HF-5160', 'Clothing & Personal Care', 'expense', 'Clothing, shoes, personal care items', false, null, null, null],
    ['HF-5170', 'Subscriptions & Memberships', 'expense', 'Streaming, gym, magazines, software', false, null, null, null],
    ['HF-5180', 'Gifts & Donations', 'expense', 'Charitable donations, gifts', true, 'Schedule A', 'us_federal', null],
    ['HF-5190', 'Miscellaneous', 'expense', 'Uncategorized household expenses', false, null, null, null],
  ],
  bakery: [
    // Income
    ['MB-4010', 'Bakery Sales', 'income', 'Revenue from bakery product sales', true, 'Schedule C', 'us_federal', null],
    // COGS
    ['MB-5010', 'Cost of Goods Sold', 'cogs', 'Raw materials, ingredients, packaging', true, 'Schedule C', 'us_federal', null],
    // Expenses
    ['MB-5020', 'Supplies', 'expense', 'Baking supplies, disposables, small tools', true, 'Schedule C', 'us_federal', null],
    ['MB-5030', 'Equipment & Supplies', 'expense', 'Equipment purchases, maintenance, replacement parts', true, 'Schedule C', 'us_federal', null],
    ['MB-5040', 'Cleaning & Maintenance', 'expense', 'Facility cleaning, pest control, maintenance', true, 'Schedule C', 'us_federal', null],
    ['MB-5050', 'Utilities', 'expense', 'Electric, gas, water for bakery operations', true, 'Schedule C', 'us_federal', null],
    ['MB-5060', 'Bank & Service Fees', 'expense', 'POS fees, merchant processing, bank charges', true, 'Schedule C', 'us_federal', null],
    ['MB-5070', 'Wages & Salaries', 'expense', 'Employee compensation and payroll taxes', true, 'Schedule C', 'us_federal', null],
    ['MB-5080', 'Motor Vehicle Expenses', 'expense', 'Delivery vehicle fuel, maintenance, insurance', true, 'Schedule C', 'us_federal', null],
    ['MB-5090', 'Product Liability Insurance', 'expense', 'Insurance for product liability claims', true, 'Schedule C', 'us_federal', null],
    ['MB-5100', 'Property Insurance', 'expense', 'Business property and contents insurance', true, 'Schedule C', 'us_federal', null],
    ['MB-5110', 'Advertising & Marketing', 'expense', 'Social media ads, flyers, promotions', true, 'Schedule C', 'us_federal', null],
    ['MB-5120', 'Rent & Lease', 'expense', 'Bakery premises rent or lease payments', true, 'Schedule C', 'us_federal', null],
    ['MB-5130', 'Professional Services', 'expense', 'Accounting, legal, consulting fees', true, 'Schedule C', 'us_federal', null],
    ['MB-5140', 'Licenses & Permits', 'expense', 'Health permits, business licenses, food handler certs', true, 'Schedule C', 'us_federal', null],
    ['MB-5150', 'Miscellaneous', 'expense', 'Other bakery business expenses', true, 'Schedule C', 'us_federal', null],
  ],
  market: [
    // Income
    ['MM-4010', 'Market Sales', 'income', 'Revenue from market retail sales', true, 'Schedule C', 'us_federal', null],
    // COGS
    ['MM-5010', 'Cost of Goods Sold', 'cogs', 'Inventory purchases for resale', true, 'Schedule C', 'us_federal', null],
    // Expenses
    ['MM-5020', 'Cleaning Expense', 'expense', 'Rental property and market cleaning', true, 'Schedule E', 'us_federal', null],
    ['MM-5030', 'Repairs & Maintenance', 'expense', 'General repairs and maintenance', true, 'Schedule E', 'us_federal', null],
    ['MM-5031', 'Repairs & Maintenance - Cleaning', 'expense', 'Cleaning-specific repair and maintenance', true, 'Schedule E', 'us_federal', 'MM-5030'],
    ['MM-5032', 'Repairs & Maintenance - Labor', 'expense', 'Labor costs for repairs', true, 'Schedule E', 'us_federal', 'MM-5030'],
    ['MM-5040', 'Advertising & Marketing', 'expense', 'Market advertising and promotions', true, 'Schedule C', 'us_federal', null],
    ['MM-5050', 'Job Supplies', 'expense', 'Operational supplies for market', true, 'Schedule C', 'us_federal', null],
    ['MM-5060', 'Insurance', 'expense', 'Business insurance premiums', true, 'Schedule C', 'us_federal', null],
    ['MM-5070', 'Utilities', 'expense', 'Electric, water, internet for market', true, 'Schedule C', 'us_federal', null],
    ['MM-5080', 'Contractors', 'expense', 'Independent contractor payments', true, 'Schedule C', 'us_federal', null],
    ['MM-5090', 'Freight Costs', 'expense', 'Shipping and freight for inventory', true, 'Schedule C', 'us_federal', null],
    ['MM-5100', 'Legal & Professional Services', 'expense', 'Legal, accounting, consulting', true, 'Schedule C', 'us_federal', null],
    ['MM-5110', 'Rent & Lease', 'expense', 'Market premises rent or lease', true, 'Schedule C', 'us_federal', null],
    ['MM-5120', 'Taxes & Licenses', 'expense', 'Business taxes, permits, licenses', true, 'Schedule C', 'us_federal', null],
    ['MM-5130', 'Auto Maintenance & Repair', 'expense', 'Vehicle expenses for market operations', true, 'Schedule C', 'us_federal', null],
    ['MM-5140', 'Credit Card Interest', 'expense', 'Interest on business credit cards', true, 'Schedule C', 'us_federal', null],
    ['MM-5150', 'Bank Fees', 'expense', 'Bank and merchant fees', true, 'Schedule C', 'us_federal', null],
    ['MM-5160', 'Travel & Mileage', 'expense', 'Business travel and mileage', true, 'Schedule C', 'us_federal', null],
    ['MM-5170', 'Wages & Salaries', 'expense', 'Employee compensation', true, 'Schedule C', 'us_federal', null],
    ['MM-5180', 'Miscellaneous', 'expense', 'Other market expenses', true, 'Schedule C', 'us_federal', null],
  ],
  personal: [
    ['PS-5010', 'Housing', 'expense', 'Personal housing costs not covered by Home vertical', false, null, null, null],
    ['PS-5020', 'Transportation', 'expense', 'Public transit, rideshare, personal vehicle', false, null, null, null],
    ['PS-5030', 'Food & Dining', 'expense', 'Restaurants, takeout, coffee shops', false, null, null, null],
    ['PS-5040', 'Healthcare', 'expense', 'Personal medical, dental, vision, therapy', true, 'Schedule A', 'us_federal', null],
    ['PS-5050', 'Insurance', 'expense', 'Life, disability, supplemental insurance', false, null, null, null],
    ['PS-5060', 'Utilities', 'expense', 'Personal phone, internet, streaming', false, null, null, null],
    ['PS-5070', 'Entertainment', 'expense', 'Movies, concerts, hobbies, games', false, null, null, null],
    ['PS-5080', 'Education', 'expense', 'Courses, books, certifications, conferences', true, 'Form 8863', 'us_federal', null],
    ['PS-5090', 'Savings & Investments', 'expense', 'Retirement contributions, investment purchases', true, 'Form 8606', 'us_federal', null],
    ['PS-5100', 'Debt Payments', 'expense', 'Student loans, personal loans', true, 'Form 1040', 'us_federal', null],
    ['PS-5110', 'Clothing & Grooming', 'expense', 'Personal clothing, shoes, grooming', false, null, null, null],
    ['PS-5120', 'Gifts & Donations', 'expense', 'Personal gifts, charitable giving', true, 'Schedule A', 'us_federal', null],
    ['PS-5130', 'Subscriptions', 'expense', 'Personal subscriptions and memberships', false, null, null, null],
    ['PS-5140', 'Childcare', 'expense', 'Personal childcare expenses', true, 'Form 2441', 'us_federal', null],
    ['PS-5150', 'Auto Maintenance & Repair', 'expense', 'Personal vehicle maintenance', false, null, null, null],
    ['PS-5160', 'Credit Card Interest', 'expense', 'Personal credit card interest', false, null, null, null],
    ['PS-5170', 'Bank Fees', 'expense', 'Personal bank account fees', false, null, null, null],
    ['PS-5180', 'Travel', 'expense', 'Personal travel and vacation', false, null, null, null],
    ['PS-5190', 'Miscellaneous', 'expense', 'Other personal expenses', false, null, null, null],
  ],
  startout: [
    ['SO-5010', 'Program Expenses', 'expense', 'Direct program delivery costs', true, 'Form 990', 'us_federal', null],
    ['SO-5020', 'Travel', 'expense', 'Business travel for StartOut activities', true, 'Form 990', 'us_federal', null],
    ['SO-5030', 'Marketing', 'expense', 'Advertising, social media, PR', true, 'Form 990', 'us_federal', null],
    ['SO-5040', 'Technology', 'expense', 'Software, hosting, hardware, SaaS tools', true, 'Form 990', 'us_federal', null],
    ['SO-5050', 'Professional Services', 'expense', 'Legal, accounting, consulting', true, 'Form 990', 'us_federal', null],
    ['SO-5060', 'Events', 'expense', 'Event production, venues, catering', true, 'Form 990', 'us_federal', null],
    ['SO-5070', 'Auto Maintenance & Repair', 'expense', 'Vehicle expenses for StartOut', true, 'Form 990', 'us_federal', null],
    ['SO-5080', 'Credit Card Interest', 'expense', 'Interest on business credit', true, 'Form 990', 'us_federal', null],
    ['SO-5090', 'Bank Fees', 'expense', 'Bank and processing fees', true, 'Form 990', 'us_federal', null],
    ['SO-5100', 'Travel & Mileage', 'expense', 'Mileage reimbursement and travel', true, 'Form 990', 'us_federal', null],
    ['SO-5110', 'Office & Admin', 'expense', 'Office supplies, postage, printing', true, 'Form 990', 'us_federal', null],
    ['SO-5120', 'Miscellaneous', 'expense', 'Other StartOut expenses', true, 'Form 990', 'us_federal', null],
  ],
  bohemian: [
    // Income
    ['BL-4010', 'Short Term Rental Income', 'income', 'Total rental income from all platforms', true, 'Schedule E', 'us_federal', null],
    ['BL-4011', 'Airbnb Rental Income', 'income', 'Income from Airbnb bookings', true, 'Schedule E', 'us_federal', 'BL-4010'],
    ['BL-4012', 'VRBO Rental Income', 'income', 'Income from VRBO bookings', true, 'Schedule E', 'us_federal', 'BL-4010'],
    ['BL-4013', 'Booking.com Rental Income', 'income', 'Income from Booking.com bookings', true, 'Schedule E', 'us_federal', 'BL-4010'],
    ['BL-4014', 'Direct Booking Income', 'income', 'Income from direct bookings', true, 'Schedule E', 'us_federal', 'BL-4010'],
    // Expenses
    ['BL-5010', 'Cleaning Expense', 'expense', 'Turnover cleaning between guests', true, 'Schedule E', 'us_federal', null],
    ['BL-5020', 'Repairs & Maintenance', 'expense', 'General property repairs and maintenance', true, 'Schedule E', 'us_federal', null],
    ['BL-5021', 'Repairs & Maintenance - Cleaning', 'expense', 'Deep cleaning and cleaning repairs', true, 'Schedule E', 'us_federal', 'BL-5020'],
    ['BL-5022', 'Repairs & Maintenance - Labor', 'expense', 'Labor costs for property repairs', true, 'Schedule E', 'us_federal', 'BL-5020'],
    ['BL-5030', 'Advertising & Marketing', 'expense', 'Platform fees, listing promotions, photography', true, 'Schedule E', 'us_federal', null],
    ['BL-5040', 'Supplies', 'expense', 'Guest amenities, linens, toiletries, consumables', true, 'Schedule E', 'us_federal', null],
    ['BL-5050', 'Insurance', 'expense', 'Property insurance, liability coverage', true, 'Schedule E', 'us_federal', null],
    ['BL-5060', 'Mortgage Interest', 'expense', 'Mortgage interest on rental properties', true, 'Schedule E', 'us_federal', null],
    ['BL-5070', 'Taxes & Licenses', 'expense', 'Property tax, occupancy tax, STR permits', true, 'Schedule E', 'us_federal', null],
    ['BL-5080', 'Travel', 'expense', 'Travel to/from rental properties', true, 'Schedule E', 'us_federal', null],
    ['BL-5090', 'Utilities', 'expense', 'Electric, water, gas, internet, cable', true, 'Schedule E', 'us_federal', null],
    ['BL-5100', 'Contractors', 'expense', 'Property management, handyman, landscaping', true, 'Schedule E', 'us_federal', null],
    ['BL-5110', 'Freight Costs', 'expense', 'Shipping for property supplies and furnishings', true, 'Schedule E', 'us_federal', null],
    ['BL-5120', 'Auto Maintenance & Repair', 'expense', 'Vehicle expenses for property management', true, 'Schedule E', 'us_federal', null],
    ['BL-5130', 'Credit Card Interest', 'expense', 'Interest on property-related credit', true, 'Schedule E', 'us_federal', null],
    ['BL-5140', 'Bank Fees', 'expense', 'Bank and processing fees', true, 'Schedule E', 'us_federal', null],
    ['BL-5150', 'Travel & Mileage', 'expense', 'Mileage for property visits and management', true, 'Schedule E', 'us_federal', null],
    ['BL-5160', 'Furnishings & Decor', 'expense', 'Furniture, artwork, staging items', true, 'Schedule E', 'us_federal', null],
    ['BL-5170', 'Professional Services', 'expense', 'Legal, accounting, property management software', true, 'Schedule E', 'us_federal', null],
    ['BL-5180', 'Miscellaneous', 'expense', 'Other rental property expenses', true, 'Schedule E', 'us_federal', null],
  ],
};

// Legacy category → new COA account number mapping (for migration)
const LEGACY_CATEGORY_MAP = {
  'Home: Mortgage/Rent': 'HF-5010',
  'Home: Property Tax': 'HF-5020',
  'Home: Home Insurance': 'HF-5030',
  'Home: Maintenance & Repairs': 'HF-5040',
  'Home: Utilities': 'HF-5050',
  'Home: Furnishings': 'HF-5060',
  'Home: Groceries': 'HF-5070',
  'Home: Childcare & Education': 'HF-5080',
  'Home: Family Activities': 'HF-5090',
  'Home: Pet Care': 'HF-5100',
  'Home: Auto Maintenance & Repair': 'HF-5110',
  'Home: Credit Card Interest Charges': 'HF-5120',
  'Home: Bank Fees': 'HF-5130',
  'Home: Traveling/Mileage Expense': 'HF-5140',
  'Home: Miscellaneous': 'HF-5190',
  'Bakery: Sales': 'MB-4010',
  'Bakery: Cost of Goods Sold': 'MB-5010',
  'Bakery: Supplies': 'MB-5020',
  'Bakery: Equipment & Supplies': 'MB-5030',
  'Bakery: Cleaning & Maintenance': 'MB-5040',
  'Bakery: Utilities': 'MB-5050',
  'Bakery: Bank and Service Fees': 'MB-5060',
  'Bakery: Wages and Salaries': 'MB-5070',
  'Bakery: Motor Vehicle Expenses': 'MB-5080',
  'Bakery: Product Liability Insurance Expense': 'MB-5090',
  'Bakery: Property Insurance Expense': 'MB-5100',
  'Market: Cleaning Expense (Rental Property)': 'MM-5020',
  'Market: Cost of Goods Sold': 'MM-5010',
  'Market: Repairs & Maintenance': 'MM-5030',
  'Market: Repairs & Maintenance:Repairs & Maintenance - Cleaning': 'MM-5031',
  'Market: Repairs & Maintenance:Repairs & Maintenance - Labor': 'MM-5032',
  'Market: Advertising & Marketing': 'MM-5040',
  'Market: Job Supplies': 'MM-5050',
  'Market: Insurance': 'MM-5060',
  'Market: Utilities': 'MM-5070',
  'Market: Contractors': 'MM-5080',
  'Market: Freight Costs': 'MM-5090',
  'Market: Legal & Professional Services': 'MM-5100',
  'Personal: Housing': 'PS-5010',
  'Personal: Transportation': 'PS-5020',
  'Personal: Food & Groceries': 'PS-5030',
  'Personal: Healthcare': 'PS-5040',
  'Personal: Insurance': 'PS-5050',
  'Personal: Utilities': 'PS-5060',
  'Personal: Entertainment': 'PS-5070',
  'Personal: Education': 'PS-5080',
  'Personal: Savings & Investments': 'PS-5090',
  'Personal: Debt Payments': 'PS-5100',
  'Personal: Clothing': 'PS-5110',
  'Personal: Gifts & Donations': 'PS-5120',
  'Personal: Subscriptions': 'PS-5130',
  'Personal: Childcare': 'PS-5140',
  'Personal: Auto Maintenance & Repair': 'PS-5150',
  'Personal: Credit Card Interest Charges': 'PS-5160',
  'Personal: Bank Fees': 'PS-5170',
  'Personal: Traveling/Mileage Expense': 'PS-5180',
  'Personal: Miscellaneous': 'PS-5190',
  'StartOut: Program Expenses': 'SO-5010',
  'StartOut: Travel': 'SO-5020',
  'StartOut: Marketing': 'SO-5030',
  'StartOut: Technology': 'SO-5040',
  'StartOut: Professional Services': 'SO-5050',
  'StartOut: Events': 'SO-5060',
  'StartOut: Auto Maintenance & Repair': 'SO-5070',
  'StartOut: Credit Card Interest Charges': 'SO-5080',
  'StartOut: Bank Fees': 'SO-5090',
  'StartOut: Traveling/Mileage Expense': 'SO-5100',
  'StartOut: Miscellaneous': 'SO-5120',
  'Bohemian: Cleaning Expense (Rental Property)': 'BL-5010',
  'Bohemian: Repairs & Maintenance': 'BL-5020',
  'Bohemian: Repairs & Maintenance:Repairs & Maintenance - Cleaning': 'BL-5021',
  'Bohemian: Repairs & Maintenance:Repairs & Maintenance - Labor': 'BL-5022',
  'Bohemian: Advertising & Marketing': 'BL-5030',
  'Bohemian: Job Supplies': 'BL-5040',
  'Bohemian: Insurance': 'BL-5050',
  'Bohemian: Interest Paid:Mortgage Interest Paid': 'BL-5060',
  'Bohemian: Taxes & Licenses': 'BL-5070',
  'Bohemian: Travel': 'BL-5080',
  'Bohemian: Utilities': 'BL-5090',
  'Bohemian: Contractors': 'BL-5100',
  'Bohemian: Freight Costs': 'BL-5110',
  'Bohemian: Short Term Rental Income': 'BL-4010',
  'Bohemian: Short Term Rental Income:Airbnb Rental Income': 'BL-4011',
  'Bohemian: Auto Maintenance & Repair': 'BL-5120',
  'Bohemian: Credit Card Interest Charges': 'BL-5130',
  'Bohemian: Bank Fees': 'BL-5140',
  'Bohemian: Traveling/Mileage Expense': 'BL-5150',
};

async function main() {
  console.log('🏦 Seeding Chart of Accounts...\n');
  
  const conn = await createConnection(process.env.DATABASE_URL);
  const now = Date.now();
  let created = 0;
  let skipped = 0;
  
  // Build parent ID lookup (accountNumber → id)
  const parentIdMap = {};
  
  for (const [vertKey, accounts] of Object.entries(ACCOUNTS)) {
    const vertical = VERTICALS[vertKey];
    console.log(`\n── ${vertical.name} (${accounts.length} accounts) ──`);
    
    for (const [accountNumber, name, accountType, description, isTaxRelevant, taxFormLine, taxJurisdiction, parentKey] of accounts) {
      // Check if already exists
      // Map accountType to DB enum values
      const typeMap = { 'expense': 'expense', 'income': 'income', 'cogs': 'cost_of_goods_sold', 'asset': 'asset', 'liability': 'liability', 'equity': 'equity' };
      const dbAccountType = typeMap[accountType] || 'expense';

      // Check if already exists
      const [existing] = await conn.execute(
        'SELECT id FROM chart_of_accounts WHERE householdId = ? AND accountNumber = ? LIMIT 1',
        [HOUSEHOLD_ID, accountNumber]
      );
      
      if (existing.length > 0) {
        parentIdMap[accountNumber] = existing[0].id;
        skipped++;
        continue;
      }
      
      const id = nanoid();
      const parentAccountId = parentKey ? (parentIdMap[parentKey] || null) : null;
      
      await conn.execute(
        `INSERT INTO chart_of_accounts (id, householdId, verticalId, accountNumber, accountName, accountType, detailType, parentAccountId, description, isTaxRelevant, taxFormLine, taxJurisdiction, isActive, isDefault, isSystemAccount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`,
        [id, HOUSEHOLD_ID, vertical.id, accountNumber, name, dbAccountType, dbAccountType === 'income' ? 'Income' : 'Expense', parentAccountId, description, isTaxRelevant ? 1 : 0, taxFormLine, taxJurisdiction, now, now]
      );
      
      parentIdMap[accountNumber] = id;
      created++;
      console.log(`  + ${accountNumber}: ${name} (${dbAccountType})`);
    }
  }
  
  console.log('\n══════════════════════════════════════════');
  console.log(`  CHART OF ACCOUNTS SEEDED`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Total accounts: ${created + skipped}`);
  console.log('══════════════════════════════════════════\n');
  
  // Export the legacy mapping for use by the migration script
  console.log('Legacy category → COA mapping exported to stdout for migration script reference.');
  
  await conn.end();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

export { LEGACY_CATEGORY_MAP, VERTICALS, ACCOUNTS };
