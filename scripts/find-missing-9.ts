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
  const enhancedTabs = sheetNames.filter(n => n.toLowerCase().includes('enhanced'));
  
  console.log('Searching for 9 Booking.com IDs across all enhanced tabs...\n');
  
  for (const tab of enhancedTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1:Z200`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) continue;
    
    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const confIdx = headers.findIndex((h: string) => h.includes('confirmation'));
    
    for (let i = 1; i < rows.length; i++) {
      const conf = rows[i][confIdx]?.trim();
      if (conf && missing.includes(conf)) {
        const fields: string[] = [];
        for (let j = 0; j < Math.min(rows[i].length, headers.length); j++) {
          if (rows[i][j] && rows[i][j].trim()) {
            fields.push(`${headers[j]}: ${rows[i][j]}`);
          }
        }
        console.log(`[${conf}] (from ${tab})`);
        console.log(`  ${fields.join('\n  ')}`);
        console.log('');
      }
    }
  }
  
  process.exit(0);
}
main();
