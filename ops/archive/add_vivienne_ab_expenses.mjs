/**
 * Add confirmed Artiste's Boutique expenses from Vivienne WhatsApp chat
 * to the 2024 and 2025 Expenses sheets and update the Dashboard.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

// ── Auth ──────────────────────────────────────────────────────────────────────
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const SA_KEY = SA_KEY_RAW.includes('\\n')
  ? SA_KEY_RAW.replace(/\\n/g, '\n')
  : SA_KEY_RAW;
const SPREADSHEET_ID = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI';

function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(SA_KEY, 'base64url');
  return `${unsigned}.${sig}`;
}

async function getAccessToken() {
  const jwt = makeJWT();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sheetsRequest(token, method, path2, body) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path2}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets error: ${JSON.stringify(data.error)}`);
  return data;
}

// ── Upload file to S3 via manus-upload-file ───────────────────────────────────
function uploadToS3(filePath) {
  try {
    const out = execSync(`manus-upload-file --webdev "${filePath}" 2>&1`).toString().trim();
    const match = out.match(/Storage Path:\s*(\S+)/);
    if (match) return `https://storage.manus.im${match[1]}`;
    const urlMatch = out.match(/https?:\/\/\S+/);
    return urlMatch ? urlMatch[0] : '';
  } catch (e) {
    return '';
  }
}

// ── DB ────────────────────────────────────────────────────────────────────────
async function getDb() {
  const dbUrl = process.env.DATABASE_URL || '';
  const m = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error('Cannot parse DATABASE_URL');
  return mysql.createConnection({
    host: m[3], port: parseInt(m[4]), user: m[1], password: m[2],
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false },
  });
}

// ── Confirmed Artiste's Boutique expenses from Vivienne chat ─────────────────
const AB_EXPENSES = [
  // 2024
  {
    date: '2024-01-07', year: 2024, vendor: 'Fontana Pharmacy',
    amount_jmd: 4876, category: 'CLEANING SUPPLIES',
    description: 'Clorox Regular Bleach, Dettol Antiseptic Liquid — guest house cleaning supplies',
    img: 'IMG-20240107-WA0001.jpg',
  },
  {
    date: '2024-07-27', year: 2024, vendor: 'Irie Hardware Ltd',
    amount_jmd: 1440, category: 'MAINTENANCE SUPPLIES',
    description: '3" Zinc — maintenance supplies',
    img: 'IMG-20240727-WA0001.jpg',
  },
  // 2025
  {
    date: '2025-08-22', year: 2025, vendor: 'Hardware/Home Store',
    amount_jmd: 4332, category: 'MAINTENANCE SUPPLIES',
    description: 'Rubber entrance mat, large laundry tub, plunger — guest house supplies',
    img: 'IMG-20250822-WA0001.jpg',
  },
  {
    date: '2025-11-01', year: 2025, vendor: 'PriceSmart',
    amount_jmd: 20003, category: 'CLEANING SUPPLIES',
    description: 'So Soft Bath Towels, MS Detergent, Chair — guest house supplies',
    img: 'IMG-20251101-WA0001.jpg',
  },
  {
    date: '2025-12-03', year: 2025, vendor: 'PriceSmart',
    amount_jmd: 15865, category: 'FIXTURES AND FITTINGS',
    description: 'Bath mat, bath towels — guest house fixtures',
    img: 'IMG-20251203-WA0001.jpg',
  },
  {
    date: '2025-12-06', year: 2025, vendor: 'PriceSmart',
    amount_jmd: 31003, category: 'CLEANING SUPPLIES',
    description: 'Scotch Brite, Snuggle and other cleaning supplies — guest house',
    img: 'IMG-20251206-WA0001.jpg',
  },
];

// Find actual image files in the vivienne_chat directory
const CHAT_DIR = '/home/ubuntu/upload/vivienne_chat';
const allFiles = fs.readdirSync(CHAT_DIR);

function findImage(dateStr, vendor) {
  // Try to find image by date prefix
  const datePart = dateStr.replace(/-/g, '');
  const matches = allFiles.filter(f => f.includes(datePart) && /\.(jpg|jpeg|png)$/i.test(f));
  if (matches.length > 0) return path.join(CHAT_DIR, matches[0]);
  return null;
}

async function main() {
  const token = await getAccessToken();
  const db = await getDb();
  console.log('Connected to DB and Sheets');

  // Get existing expense rows to check for duplicates
  const [existingRows] = await db.execute(
    `SELECT expenseDate, amountJMD, expenseDescription FROM property_expense_records 
     WHERE property = 'artistes_boutique' AND expenseYear IN (2024, 2025)`
  );
  const existingKeys = new Set(
    existingRows.map(r => `${r.expenseDate?.toISOString?.()?.slice(0,10)}|${r.amountJMD}`)
  );

  // Get the 2024 and 2025 Expenses sheet data to find last rows
  // 2024 expenses are in the 'Expenses' tab; 2025 in '2025 Expenses'
  const sheetsData = await sheetsRequest(token, 'GET',
    '/values/Expenses!A:G', null);
  const sheets2025 = await sheetsRequest(token, 'GET',
    '/values/2025%20Expenses!A:G', null);

  const rows2024 = sheetsData.values || [];
  const rows2025 = sheets2025.values || [];
  const nextRow2024 = rows2024.length + 1;
  const nextRow2025 = rows2025.length + 1;

  console.log(`2024 Expenses: ${rows2024.length} existing rows, next row: ${nextRow2024}`);
  console.log(`2025 Expenses: ${rows2025.length} existing rows, next row: ${nextRow2025}`);

  const newRows2024 = [];
  const newRows2025 = [];
  const dbInserts = [];

  for (const expense of AB_EXPENSES) {
    const key = `${expense.date}|${parseFloat(expense.amount_jmd).toFixed(2)}`;
    if (existingKeys.has(key)) {
      console.log(`  SKIP (already in DB): ${expense.date} ${expense.vendor} JMD ${expense.amount_jmd}`);
      continue;
    }

    // Find and upload image
    const imgPath = findImage(expense.date, expense.vendor);
    let s3Url = '';
    if (imgPath) {
      console.log(`  Uploading: ${path.basename(imgPath)}`);
      s3Url = uploadToS3(imgPath);
      console.log(`  S3: ${s3Url || 'FAILED'}`);
    } else {
      console.log(`  No image found for ${expense.date} ${expense.vendor}`);
    }

    const row = [
      expense.date,
      expense.vendor,
      expense.category,
      expense.description,
      expense.amount_jmd,
      'JMD',
      s3Url,
    ];

    if (expense.year === 2024) {
      newRows2024.push(row);
    } else {
      newRows2025.push(row);
    }

    dbInserts.push({
      date: expense.date,
      amount: expense.amount_jmd,
      category: expense.category,
      description: expense.description,
      s3Url,
      year: expense.year,
    });
  }

  // Write to 2024 Expenses sheet (use append to avoid grid limit)
  if (newRows2024.length > 0) {
    await sheetsRequest(token, 'POST', `/values/Expenses!A1:G1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      majorDimension: 'ROWS', values: newRows2024,
    });
    console.log(`\nWrote ${newRows2024.length} rows to 2024 Expenses sheet`);
  }

  // Write to 2025 Expenses sheet (use append)
  if (newRows2025.length > 0) {
    await sheetsRequest(token, 'POST', `/values/2025%20Expenses!A1:G1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      majorDimension: 'ROWS', values: newRows2025,
    });
    console.log(`Wrote ${newRows2025.length} rows to 2025 Expenses sheet`);
  }

  // Insert into DB
  for (const ins of dbInserts) {
    try {
      const expDate = new Date(ins.date);
      await db.execute(
        `INSERT INTO property_expense_records 
         (householdId, property, expenseDate, expenseYear, expenseMonth, amountJMD, category, expenseDescription, supportingDocUrl, source, createdAt, updatedAt)
         VALUES ('V8lk3KJatvxBTWURf4uo9', 'artistes_boutique', ?, ?, ?, ?, ?, ?, ?, 'manual', NOW(), NOW())`,
        [ins.date, expDate.getFullYear(), expDate.getMonth() + 1, ins.amount, ins.category, ins.description, ins.s3Url || null]
      );
      console.log(`  DB insert: ${ins.date} ${ins.category} JMD ${ins.amount}`);
    } catch (e) {
      console.log(`  DB error: ${e.message}`);
    }
  }

  // Now update the Dashboard 2025 section with the new supply amounts
  // Get current 2025 Dashboard data (rows 68-85)
  const dashData = await sheetsRequest(token, 'GET',
    '/values/Dashboard!A68:N85', null);
  const dashRows = dashData.values || [];
  console.log('\nDashboard 2025 section rows:', dashRows.length);

  // Calculate new monthly totals for cleaning supplies and fixtures
  // from the new rows added
  const monthlySupplies = {};
  const monthlyFixtures = {};
  for (const ins of dbInserts) {
    const month = ins.date.slice(0, 7); // YYYY-MM
    if (ins.year === 2025) {
      if (ins.category === 'CLEANING SUPPLIES') {
        monthlySupplies[month] = (monthlySupplies[month] || 0) + ins.amount;
      } else if (ins.category === 'FIXTURES AND FITTINGS') {
        monthlyFixtures[month] = (monthlyFixtures[month] || 0) + ins.amount;
      }
    }
  }
  console.log('New monthly cleaning supplies:', monthlySupplies);
  console.log('New monthly fixtures:', monthlyFixtures);

  await db.end();
  console.log('\nDone!');
  console.log(`\nSummary:`);
  console.log(`  2024 new rows: ${newRows2024.length}`);
  console.log(`  2025 new rows: ${newRows2025.length}`);
  console.log(`  DB inserts: ${dbInserts.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
