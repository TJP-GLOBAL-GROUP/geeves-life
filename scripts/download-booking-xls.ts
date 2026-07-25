/**
 * Download Booking.com reservation XLS files from Google Drive
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { decryptToken } from "../server/tokenEncryption";
import { refreshAccessToken } from "../server/services/googleCalendarSync";
import fs from "fs";
import path from "path";

const BOOKING_FILES = [
  { id: "15x6ioXUhK_acyobcgGyzSuzhsnKBomeG", name: "reservations-2024-10-01 (1).xls" },
  { id: "1uuTSjyyep26U9a2Hm1KNfra1p3VJuytv", name: "reservations-2024-10-01.xls" },
];

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  
  const [rows] = await pool.query(
    `SELECT refreshToken FROM oauth_tokens WHERE provider = 'google' AND scopes LIKE '%drive%' AND accountEmail = 'tarikp@gmail.com' LIMIT 1`
  ) as any;
  
  if (rows.length === 0) {
    console.error("No Google OAuth token with Drive scope found");
    await pool.end();
    process.exit(1);
  }
  
  let refreshToken = rows[0].refreshToken;
  try {
    refreshToken = decryptToken(refreshToken);
  } catch (e) {}
  
  const { accessToken } = await refreshAccessToken(refreshToken);
  console.log("Got access token ✓");
  
  // Also search for any other reservation/booking XLS files we might have missed
  const searchQuery = "(name contains 'reservation' or name contains 'Booking') and (mimeType='application/vnd.ms-excel' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')";
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=50`;
  
  const searchResp = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (searchResp.ok) {
    const searchData = await searchResp.json() as any;
    console.log(`\nFound ${searchData.files?.length || 0} reservation/booking spreadsheets:`);
    for (const file of (searchData.files || [])) {
      console.log(`  📄 ${file.name} (${file.id}) - ${file.modifiedTime}`);
      // Add to download list if not already there
      if (!BOOKING_FILES.find(f => f.id === file.id)) {
        BOOKING_FILES.push({ id: file.id, name: file.name });
      }
    }
  }
  
  // Download each file
  const outputDir = "/home/ubuntu/tax_prep/booking_xls";
  fs.mkdirSync(outputDir, { recursive: true });
  
  for (const file of BOOKING_FILES) {
    console.log(`\nDownloading: ${file.name}...`);
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    
    const resp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!resp.ok) {
      console.error(`  Error downloading: ${resp.status} ${await resp.text()}`);
      continue;
    }
    
    const buffer = Buffer.from(await resp.arrayBuffer());
    const outputPath = path.join(outputDir, file.name);
    fs.writeFileSync(outputPath, buffer);
    console.log(`  ✓ Saved to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
  
  await pool.end();
  console.log("\nDone! Files saved to:", outputDir);
}

main().catch(e => { console.error(e); process.exit(1); });
