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
  
  const missing = ['5914779093','6108345671','6152048756','6186367098','6199754500','6259614150','6300927700','6320697500','6352150000'];
  
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];
  
  console.log('All tabs in spreadsheet:', sheetNames.join(', '));
  console.log('\nSearching ALL tabs for 9 Booking.com IDs...\n');
  
  for (const tab of sheetNames) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tab}'!A1:Z200`,
      });
      const rows = res.data.values || [];
      if (rows.length < 2) continue;
      
      // Search all cells for any of the missing confirmation numbers
      for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < rows[i].length; j++) {
          const cell = rows[i][j]?.trim();
          if (cell && missing.includes(cell)) {
            console.log(`Found ${cell} in tab "${tab}" at row ${i + 1}, col ${j + 1}`);
            // Print the full row
            const headers = rows[0] || [];
            const fields: string[] = [];
            for (let k = 0; k < rows[i].length; k++) {
              if (rows[i][k] && rows[i][k].trim()) {
                fields.push(`${headers[k] || `col${k}`}: ${rows[i][k]}`);
              }
            }
            console.log(`  ${fields.join(' | ')}`);
            console.log('');
          }
        }
      }
    } catch (e) {
      // Skip tabs that can't be read
    }
  }
  
  process.exit(0);
}
main();
