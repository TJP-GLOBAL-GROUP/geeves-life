import { google } from 'googleapis';

const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Check the non-enhanced income tabs and the raw income tab
  const tabs = ['2025 Income', '2026 Income', 'Income '];
  
  for (const tab of tabs) {
    console.log(`\n=== Tab: "${tab}" ===`);
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tab}'!A1:Z300`,
      });
      const rows = res.data.values || [];
      console.log(`  Rows: ${rows.length}`);
      if (rows.length > 0) {
        console.log(`  Headers: ${rows[0].join(' | ')}`);
      }
      
      // Find any cell containing the booking.com IDs
      const missing = ['5914779093','6108345671','6152048756','6186367098','6199754500','6259614150','6300927700','6320697500','6352150000'];
      
      for (let i = 1; i < rows.length; i++) {
        for (let j = 0; j < (rows[i]?.length || 0); j++) {
          const cell = rows[i][j]?.toString().trim();
          if (cell && missing.some(m => cell.includes(m))) {
            console.log(`  Found at row ${i+1}: ${rows[i].join(' | ')}`);
          }
        }
      }
      
      // Also show last few rows to understand the data range
      if (rows.length > 3) {
        console.log(`  Last data row: ${rows[rows.length - 1].join(' | ')}`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  // Also check if these are future bookings not yet in the spreadsheet
  console.log('\n\n=== CONCLUSION ===');
  console.log('If the 9 Booking.com IDs are not found in any tab, they are likely:');
  console.log('1. Future bookings (2025-2026) not yet added to the spreadsheet');
  console.log('2. Or bookings that were in the Oct 2024 XLS but the spreadsheet was not updated');
  
  process.exit(0);
}
main();
