import { google } from 'googleapis';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  // Try service account first
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  if (!serviceAccountEmail || !serviceAccountKey) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountEmail,
      private_key: serviceAccountKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // First, get all sheet names
  console.log('Fetching spreadsheet metadata...');
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheetNames = metadata.data.sheets?.map(s => s.properties?.title) || [];
  console.log('\n=== ALL TABS ===');
  sheetNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

  // Find (enhanced) and (detail) tabs
  const enhancedTabs = sheetNames.filter(n => n?.toLowerCase().includes('enhanced'));
  const detailTabs = sheetNames.filter(n => n?.toLowerCase().includes('detail'));

  console.log('\n=== INCOME TABS (enhanced) ===');
  enhancedTabs.forEach(name => console.log(`  - ${name}`));

  console.log('\n=== EXPENSE TABS (detail) ===');
  detailTabs.forEach(name => console.log(`  - ${name}`));

  // Read each enhanced tab
  for (const tabName of enhancedTabs) {
    console.log(`\n\n========== ${tabName} ==========`);
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A1:Z200`,
      });
      const rows = response.data.values || [];
      console.log(`Rows: ${rows.length}`);
      // Print first 5 rows to understand structure
      rows.slice(0, 5).forEach((row, i) => console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`));
      // Print last 5 rows to see totals
      if (rows.length > 10) {
        console.log('  ...');
        rows.slice(-5).forEach((row, i) => console.log(`  Row ${rows.length - 4 + i}: ${JSON.stringify(row)}`));
      }
    } catch (err: any) {
      console.error(`  Error reading ${tabName}: ${err.message}`);
    }
  }

  // Read each detail tab
  for (const tabName of detailTabs) {
    console.log(`\n\n========== ${tabName} ==========`);
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A1:Z200`,
      });
      const rows = response.data.values || [];
      console.log(`Rows: ${rows.length}`);
      // Print first 5 rows to understand structure
      rows.slice(0, 5).forEach((row, i) => console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`));
      // Print last 5 rows to see totals
      if (rows.length > 10) {
        console.log('  ...');
        rows.slice(-5).forEach((row, i) => console.log(`  Row ${rows.length - 4 + i}: ${JSON.stringify(row)}`));
      }
    } catch (err: any) {
      console.error(`  Error reading ${tabName}: ${err.message}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
