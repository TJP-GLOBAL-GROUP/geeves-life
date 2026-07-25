"""
Compile all income data for Artiste's Boutique (7 Dillsbury Ave, Kingston JA)
from:
  1. Gmail payout emails (all_payouts.json) - already collected
  2. 2024 Rental Income calculations.xlsx (bank deposit records)
  3. 2023 Airbnb CSV (for reference/cross-check)
  4. VRBO PayoutSummaryReport CSV

Output: income_records.json with deduplicated, year-annotated payout records
"""
import json, csv, re, openpyxl
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from fpdf import FPDF

DATA_DIR = Path('/home/ubuntu/upload/airbnb_data')
OUTPUT_DIR = Path('/home/ubuntu/upload/income_docs')
OUTPUT_DIR.mkdir(exist_ok=True)

def sanitize(t):
    return ''.join(c if ord(c) < 256 else '?' for c in (t or ''))

def make_pdf(title, date_str, platform, amount_usd, details, path):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 12)
    pdf.cell(0, 8, sanitize(f'Income Evidence - {platform.upper()} Payout'), ln=True)
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(0, 6, f'Date: {date_str}', ln=True)
    pdf.cell(0, 6, f'Platform: {platform}', ln=True)
    pdf.cell(0, 6, f'Amount: USD ${amount_usd:,.2f}', ln=True)
    pdf.ln(4)
    pdf.set_font('Helvetica', '', 9)
    pdf.multi_cell(0, 5, sanitize(str(details)[:2000]))
    pdf.output(str(path))

# ── Load existing Gmail payouts ───────────────────────────────────────────
with open('/home/ubuntu/upload/all_payouts.json') as f:
    gmail_payouts = json.load(f)

print(f'Gmail payouts loaded: {len(gmail_payouts)}')

# ── Parse 2024 Rental Income calculations.xlsx ────────────────────────────
wb = openpyxl.load_workbook(DATA_DIR / '2024 Rental Income calculations.xlsx', data_only=True)
spreadsheet_txns = []

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    header_row = None
    headers = []
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=5, values_only=True), 1):
        if row and any(str(v or '').lower() in ['date', 'type', 'amount', 'total amount'] for v in row):
            header_row = i
            headers = [str(v or '').lower().strip() for v in row]
            break
    if not header_row:
        continue

    def col(names):
        for i, h in enumerate(headers):
            if any(n in h for n in names):
                return i
        return None

    date_col = col(['date'])
    type_col = col(['type'])
    contact_col = col(['contact'])
    amount_col = col(['total amount', 'amount'])
    memo_col = col(['memo'])

    if date_col is None or amount_col is None:
        continue

    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if not row or row[date_col] is None:
            continue
        d = row[date_col]
        if isinstance(d, datetime):
            date_str = d.strftime('%Y-%m-%d')
            year, month = d.year, d.month
        elif isinstance(d, str):
            dt = None
            for fmt in ['%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y']:
                try:
                    dt = datetime.strptime(d.strip(), fmt)
                    break
                except:
                    pass
            if not dt:
                continue
            date_str = dt.strftime('%Y-%m-%d')
            year, month = dt.year, dt.month
        else:
            continue

        amt = row[amount_col]
        if amt is None:
            continue
        if isinstance(amt, str):
            amt = float(re.sub(r'[,$]', '', amt)) if re.search(r'\d', amt) else 0
        else:
            try:
                amt = float(amt)
            except:
                continue

        if amt <= 0:
            continue

        txn_type = str(row[type_col] or '').lower() if type_col is not None else ''
        contact = str(row[contact_col] or '').lower() if contact_col is not None else ''
        memo = str(row[memo_col] or '') if memo_col is not None else ''

        if 'deposit' in txn_type or 'airbnb' in contact or 'AIRBNB' in memo.upper():
            spreadsheet_txns.append({
                'source': f'spreadsheet_{sheet_name}',
                'date': date_str,
                'year': year,
                'month': month,
                'platform': 'airbnb',
                'amount_usd': round(amt, 2),
                'memo': memo[:150],
            })

print(f'Spreadsheet transactions: {len(spreadsheet_txns)}')

# ── Parse 2023 Airbnb CSV ─────────────────────────────────────────────────
airbnb_csv_txns = []
csv_path = DATA_DIR / 'mac_downloads' / 'airbnb_01_2023-12_2023.csv'
if csv_path.exists():
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('Type', '').lower() != 'payout':
                continue
            d_str = row.get('Date', '')
            try:
                dt = datetime.strptime(d_str.strip(), '%m/%d/%Y')
            except:
                continue
            paid_out = row.get('Paid out', '').replace(',', '').strip()
            try:
                amt = float(paid_out) if paid_out else 0
            except:
                amt = 0
            if amt <= 0:
                continue
            airbnb_csv_txns.append({
                'source': 'airbnb_csv_2023',
                'date': dt.strftime('%Y-%m-%d'),
                'year': dt.year,
                'month': dt.month,
                'platform': 'airbnb',
                'amount_usd': amt,
                'memo': row.get('Details', '')[:150],
            })
    print(f'2023 Airbnb CSV payouts: {len(airbnb_csv_txns)}')

# ── Parse VRBO CSV ────────────────────────────────────────────────────────
vrbo_txns = []
vrbo_csv = DATA_DIR / 'VRBO PayoutSummaryReport_2022-01-02_2022-12-31.csv'
if vrbo_csv.exists():
    with open(vrbo_csv, newline='', encoding='utf-8-sig') as f:
        content = f.read()
    print(f'\nVRBO CSV preview:\n{content[:500]}')

# ── Merge all sources ─────────────────────────────────────────────────────
# Use Gmail payouts as primary (they have email evidence)
# Supplement with spreadsheet data for any gaps

# Build lookup of existing payouts by (year, month, approx_amount)
def payout_key(year, month, amount):
    # Round to nearest $5 for fuzzy matching
    rounded = round(amount / 5) * 5
    return f'{year}-{month:02d}-{rounded}'

existing_keys = set()
for p in gmail_payouts:
    existing_keys.add(payout_key(p['year'], p['month'], p['amount_usd']))

# Find spreadsheet transactions not in Gmail payouts
new_from_spreadsheet = []
for t in spreadsheet_txns:
    key = payout_key(t['year'], t['month'], t['amount_usd'])
    if key not in existing_keys:
        existing_keys.add(key)
        # Create PDF evidence
        safe_date = t['date'].replace('-', '')
        out = OUTPUT_DIR / f'{safe_date}_airbnb_bank_deposit_{t["amount_usd"]:.0f}usd.pdf'
        make_pdf('Bank Deposit - Airbnb', t['date'], 'airbnb', t['amount_usd'],
                 f'Source: {t["source"]}\nMemo: {t["memo"]}', out)
        new_from_spreadsheet.append({
            'account': 'bank_statement',
            'platform': 'airbnb',
            'email_type': 'bank_deposit',
            'subject': f'Airbnb bank deposit {t["date"]}',
            'sender': 'bank_statement',
            'date': t['date'],
            'month': t['month'],
            'year': t['year'],
            'amount_usd': t['amount_usd'],
            'amount_jmd': 0,
            'files': [str(out)],
        })

print(f'\nNew transactions from spreadsheet not in Gmail: {len(new_from_spreadsheet)}')

# Merge
all_income = gmail_payouts + new_from_spreadsheet

# Save
with open('/home/ubuntu/upload/all_income_records.json', 'w') as f:
    json.dump(all_income, f, indent=2)

# ── Summary ───────────────────────────────────────────────────────────────
by_year = defaultdict(lambda: defaultdict(float))
by_year_count = defaultdict(lambda: defaultdict(int))
for p in all_income:
    by_year[p['year']][p['platform']] += p['amount_usd']
    by_year_count[p['year']][p['platform']] += 1

print('\n=== INCOME SUMMARY ===')
for year in sorted(by_year.keys()):
    total = sum(by_year[year].values())
    total_count = sum(by_year_count[year].values())
    print(f'\n{year}: {total_count} payouts, USD ${total:,.2f}')
    for plat in sorted(by_year[year].keys()):
        print(f'  {plat}: {by_year_count[year][plat]} payouts, USD ${by_year[year][plat]:,.2f}')

# Monthly breakdown for 2024, 2025, 2026
for year in [2024, 2025, 2026]:
    print(f'\n=== {year} MONTHLY BREAKDOWN ===')
    monthly = defaultdict(float)
    for p in all_income:
        if p['year'] == year:
            monthly[p['month']] += p['amount_usd']
    for m in range(1, 13):
        amt = monthly.get(m, 0)
        bar = '█' * int(amt / 100)
        print(f'  {year}-{m:02d}: USD ${amt:>8,.2f}  {bar}')

print(f'\nTotal income records: {len(all_income)}')
