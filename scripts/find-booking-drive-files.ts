/**
 * Find Booking.com data files in Google Drive using the project's OAuth tokens
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { decryptToken } from "../server/tokenEncryption";
import { refreshAccessToken } from "../server/services/googleCalendarSync";

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  // Get the owner's OAuth token (Tarik's Google account)
  const [rows] = await pool.query(
    `SELECT refreshToken, provider, accountEmail FROM oauth_tokens WHERE provider = 'google' AND scopes LIKE '%drive%' AND accountEmail = 'tarikp@gmail.com' LIMIT 1`
  ) as any;
  
  console.log("Found OAuth tokens:", rows.length);
  for (const row of rows) {
    console.log(`  - ${row.accountEmail} (${row.provider})`);
  }
  
  if (rows.length === 0) {
    console.error("No Google OAuth tokens found in database");
    await pool.end();
    process.exit(1);
  }
  
  // Use the first token (should be Tarik's)
  const token = rows[0];
  let refreshToken = token.refreshToken;
  
  // Decrypt if encrypted
  try {
    refreshToken = decryptToken(refreshToken);
  } catch (e) {
    // May already be plaintext
  }
  
  console.log(`\nUsing token for: ${token.accountEmail}`);
  console.log("Refreshing access token...");
  
  const { accessToken } = await refreshAccessToken(refreshToken);
  console.log("Got access token ✓");
  
  // Search for Booking.com related files in Drive
  const queries = [
    "name contains 'booking' or name contains 'Booking'",
    "name contains 'reservation' or name contains 'Reservation'",
    "name contains 'extranet'",
  ];
  
  for (const q of queries) {
    console.log(`\n--- Searching: ${q} ---`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=50`;
    
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!resp.ok) {
      console.error(`  Error: ${resp.status} ${await resp.text()}`);
      continue;
    }
    
    const data = await resp.json() as any;
    if (data.files && data.files.length > 0) {
      for (const file of data.files) {
        console.log(`  📄 ${file.name}`);
        console.log(`     ID: ${file.id}`);
        console.log(`     Type: ${file.mimeType}`);
        console.log(`     Modified: ${file.modifiedTime}`);
        if (file.size) console.log(`     Size: ${(parseInt(file.size) / 1024).toFixed(1)} KB`);
        console.log();
      }
    } else {
      console.log("  (no results)");
    }
  }
  
  // Also search for XLS/XLSX/CSV files that might be property-related
  console.log("\n--- Searching for spreadsheet files (XLS/XLSX/CSV) ---");
  const spreadsheetQuery = "(mimeType='application/vnd.ms-excel' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='text/csv' or name contains '.xls' or name contains '.csv')";
  const url2 = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(spreadsheetQuery)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=50&orderBy=modifiedTime desc`;
  
  const resp2 = await fetch(url2, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (resp2.ok) {
    const data2 = await resp2.json() as any;
    if (data2.files && data2.files.length > 0) {
      for (const file of data2.files) {
        console.log(`  📄 ${file.name}`);
        console.log(`     ID: ${file.id}`);
        console.log(`     Type: ${file.mimeType}`);
        console.log(`     Modified: ${file.modifiedTime}`);
        if (file.size) console.log(`     Size: ${(parseInt(file.size) / 1024).toFixed(1)} KB`);
        console.log();
      }
    } else {
      console.log("  (no results)");
    }
  }
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
