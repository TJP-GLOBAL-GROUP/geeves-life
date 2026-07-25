import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [all] = await conn.execute('SELECT thumbnailUrls, rawDescription FROM walmart_orders WHERE thumbnailUrls IS NOT NULL');

let productThumbs = 0;
let genericIcons = 0;

for (const r of all) {
  const urls = r.thumbnailUrls;
  if (urls && urls.length > 0) {
    const hasProduct = urls.some(u => 
      u.includes('asr-') || u.includes('seo/') || u.includes('/ip/')
    );
    if (hasProduct) productThumbs++;
    else genericIcons++;
  }
}

console.log('Orders with product thumbnails:', productThumbs);
console.log('Orders with only generic icons:', genericIcons);
console.log('Total with thumbnails:', all.length);

// Show samples
const [samples] = await conn.execute('SELECT thumbnailUrls, rawDescription FROM walmart_orders WHERE thumbnailUrls IS NOT NULL LIMIT 10');
for (let i = 0; i < samples.length; i++) {
  const urls = samples[i].thumbnailUrls || [];
  console.log(`${i+1}: ${urls.length} thumbs | ${urls[0]?.substring(0, 100)}`);
  console.log(`   desc: ${samples[i].rawDescription?.substring(0, 80)}`);
}

conn.destroy();
process.exit(0);
