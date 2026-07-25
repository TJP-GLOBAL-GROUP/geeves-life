// Find the earliest available date for fawazahmed0 currency-api
const testDates = [
  '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-15',
  '2024-02-01', '2024-03-01', '2024-03-02', '2024-03-03',
];

for (const date of testDates) {
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`;
  const res = await fetch(url);
  if (res.ok) {
    const data = await res.json();
    console.log(`✓ ${date}: JMD=${data.usd?.jmd}`);
  } else {
    console.log(`✗ ${date}: HTTP ${res.status}`);
  }
}
