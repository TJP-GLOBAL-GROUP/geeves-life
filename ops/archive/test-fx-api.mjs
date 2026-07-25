// Test various exchange rate API formats
const dates = ['2022-03-15', '2023-06-01', '2024-06-15', '2025-01-10', '2026-07-01'];

async function testDate(date) {
  // Format 1: @YYYY-MM-DD (worked for 2024-06-15)
  const url1 = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`;
  // Format 2: @YYYY.M.D
  const parts = date.split('-');
  const url2 = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${parts[0]}.${parseInt(parts[1])}.${parseInt(parts[2])}/v1/currencies/usd.json`;
  // Format 3: latest endpoint
  const url3 = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`;
  
  for (const [label, url] of [['@date', url1], ['@Y.M.D', url2]]) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log(`  ${label} ${date}: JMD=${data.usd?.jmd || 'N/A'} (date=${data.date})`);
        return data.usd?.jmd;
      } else {
        console.log(`  ${label} ${date}: HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`  ${label} ${date}: ERROR ${e.message}`);
    }
  }
  return null;
}

// Also test the open.er-api.com pair endpoint
async function testErApi(date) {
  const url = `https://v6.exchangerate-api.com/v6/open/historical/USD/${date.replace(/-/g, '/')}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      console.log(`  er-api ${date}: JMD=${data.rates?.JMD || 'N/A'}`);
    } else {
      console.log(`  er-api ${date}: HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`  er-api ${date}: ERROR ${e.message}`);
  }
}

console.log('Testing fawazahmed0 currency-api:');
for (const d of dates) {
  await testDate(d);
}

console.log('\nTesting exchangerate-api:');
for (const d of dates) {
  await testErApi(d);
}

// Test the latest to confirm current rate
console.log('\nLatest rate:');
const latest = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
if (latest.ok) {
  const data = await latest.json();
  console.log(`  Latest: JMD=${data.usd?.jmd} (date=${data.date})`);
}
