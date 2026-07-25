/**
 * Recursively explore the Short Term Reservation Data folders in Google Drive
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { decryptToken } from "../server/tokenEncryption";
import { refreshAccessToken } from "../server/services/googleCalendarSync";

async function listFolder(accessToken: string, folderId: string, indent: string = ""): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents`)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    console.error(`${indent}Error listing folder: ${resp.status}`);
    return;
  }
  const data = await resp.json() as any;
  for (const file of (data.files || [])) {
    const size = file.size ? ` (${(parseInt(file.size) / 1024).toFixed(1)} KB)` : "";
    console.log(`${indent}📄 ${file.name}${size} [${file.mimeType}] ${file.modifiedTime}`);
    if (file.mimeType === "application/vnd.google-apps.folder") {
      await listFolder(accessToken, file.id, indent + "  ");
    }
  }
}

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const [rows] = await pool.query(
    `SELECT refreshToken FROM oauth_tokens WHERE provider = 'google' AND scopes LIKE '%drive%' AND accountEmail = 'tarik@tjperkinsfam.com' LIMIT 1`
  ) as any;
  
  let refreshToken = rows[0].refreshToken;
  try { refreshToken = decryptToken(refreshToken); } catch (e) {}
  const { accessToken } = await refreshAccessToken(refreshToken);
  
  // Explore both reservation data folders
  const folders = [
    { id: "13IGsXqUlZf-PtZeQDH2BNS-7iBy99nf8", name: "Short Term Airbnb, Booking.com, VRBO Reservation Data (newer)" },
    { id: "10gOhv7oWRlimVenOdEeQTqIyGVH_VTI3", name: "Short Term Airbnb, Booking.com, vrbo Reservation Data (older)" },
  ];
  
  for (const folder of folders) {
    console.log(`\n=== ${folder.name} ===`);
    await listFolder(accessToken, folder.id);
  }
  
  // Also download the big reservation file we found
  console.log("\n\n=== Downloading Reservations_2024-01-01_2026-12-31.xls ===");
  const fileId = "1SlXulzwjgXJ3FhzlEuaS9J65Pnf2mvgs";
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const resp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.ok) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    const fs = await import("fs");
    fs.writeFileSync("/home/ubuntu/tax_prep/booking_xls/Reservations_2024-01-01_2026-12-31.xls", buffer);
    console.log(`✓ Downloaded (${(buffer.length / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`Error: ${resp.status} ${await resp.text()}`);
  }
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
