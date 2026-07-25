import mysql.connector
import pandas as pd
from urllib.parse import urlparse
from decimal import Decimal

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(DB_URL)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# === GEEVES DB: STR Income from property_bookings ===
# Join with properties and property_platforms to get property name and platform
cur.execute("""
    SELECT 
        YEAR(FROM_UNIXTIME(pb.checkIn/1000)) as year,
        p.name as property_name,
        pp.platform,
        COUNT(*) as bookings,
        SUM(pb.netAmount) as net_payout,
        SUM(pb.totalPrice) as gross_revenue,
        SUM(pb.commissionAmount) as commission
    FROM property_bookings pb
    JOIN properties p ON pb.propertyId = p.id
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pb.bookingStatus != 'cancelled' 
      AND pb.bookingType = 'booking'
      AND pb.netAmount > 0
    GROUP BY YEAR(FROM_UNIXTIME(pb.checkIn/1000)), p.name, pp.platform
    ORDER BY year, p.name, pp.platform
""")
booking_data = cur.fetchall()

print("=" * 100)
print("GEEVES DB - SHORT TERM RENTAL INCOME (property_bookings)")
print("=" * 100)
year_totals_geeves = {}
for r in booking_data:
    y = int(r['year'])
    net = float(r['net_payout'] or 0)
    gross = float(r['gross_revenue'] or 0)
    comm = float(r['commission'] or 0)
    print(f"  {y} | {r['property_name']:<25} | {r['platform']:<12} | {r['bookings']:>3} bookings | Gross: ${gross:>10,.2f} | Commission: ${comm:>8,.2f} | Net: ${net:>10,.2f}")
    if y not in year_totals_geeves:
        year_totals_geeves[y] = {'net': 0, 'gross': 0, 'commission': 0, 'bookings': 0}
    year_totals_geeves[y]['net'] += net
    year_totals_geeves[y]['gross'] += gross
    year_totals_geeves[y]['commission'] += comm
    year_totals_geeves[y]['bookings'] += r['bookings']

print(f"\nGeeves DB Totals by Year:")
for y in sorted(year_totals_geeves):
    t = year_totals_geeves[y]
    print(f"  {y}: {t['bookings']} bookings | Gross: ${t['gross']:,.2f} | Commission: ${t['commission']:,.2f} | Net: ${t['net']:,.2f}")

# Also check Stripe income for Bohemian Lodges (Artiste's Boutique via Stripe)
cur.execute("""
    SELECT YEAR(created_at) as year, business_vertical,
           COUNT(*) as txns, SUM(amount) as gross, SUM(fee) as fees, SUM(net) as net_amt
    FROM stripe_transactions 
    WHERE type='charge' AND business_vertical = 'bohemian_lodges'
    GROUP BY YEAR(created_at), business_vertical
    ORDER BY year
""")
stripe_lodges = cur.fetchall()
print(f"\nGeeves DB - Stripe Income (Bohemian Lodges / Artiste's Boutique):")
for r in stripe_lodges:
    print(f"  {r['year']} | {r['txns']} txns | Gross: ${float(r['gross'] or 0):,.2f} | Fees: ${float(r['fees'] or 0):,.2f} | Net: ${float(r['net_amt'] or 0):,.2f}")

# Stripe income for other verticals
cur.execute("""
    SELECT YEAR(created_at) as year, business_vertical,
           COUNT(*) as txns, SUM(amount) as gross, SUM(fee) as fees, SUM(net) as net_amt
    FROM stripe_transactions 
    WHERE type='charge' AND business_vertical NOT IN ('unclassified', 'bohemian_lodges')
    GROUP BY YEAR(created_at), business_vertical
    ORDER BY year, business_vertical
""")
stripe_biz = cur.fetchall()
print(f"\nGeeves DB - Stripe Income (Business Verticals):")
for r in stripe_biz:
    print(f"  {r['year']} | {r['business_vertical']:<20} | {r['txns']} txns | Gross: ${float(r['gross'] or 0):,.2f}")

conn.close()

# === QBO DATA ===
print("\n\n" + "=" * 100)
print("QBO - INCOME BY VERTICAL AND YEAR")
print("=" * 100)

df = pd.read_csv('/home/ubuntu/tax_prep/qbo_transaction_list.csv', skiprows=3, encoding='utf-8-sig')
df = df[df['Date'].notna() & ~df['Date'].str.contains('TOTAL|Saturday', na=False)]
df['parsed_date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y', errors='coerce')
df['year'] = df['parsed_date'].dt.year
df['amount_num'] = pd.to_numeric(df['Amount'].astype(str).str.replace(',', ''), errors='coerce')

# STR Income in QBO
str_income_qbo = df[df['Split'].str.contains('Short Term Rental Income', na=False) & (df['amount_num'] > 0)].copy()
print(f"\nQBO STR Income by Customer and Year:")
str_by_cust_year = str_income_qbo.pivot_table(index='Customer', columns='year', values='amount_num', aggfunc='sum', fill_value=0)
str_by_cust_year['Total'] = str_by_cust_year.sum(axis=1)
print(str_by_cust_year.sort_values('Total', ascending=False).to_string())

qbo_str_yearly = str_income_qbo.groupby('year')['amount_num'].sum()
print(f"\nQBO STR Income Yearly Totals:")
for y, v in qbo_str_yearly.items():
    print(f"  {int(y)}: ${v:,.2f}")

# === COMPARISON ===
print("\n\n" + "=" * 100)
print("INCOME COMPARISON: QBO vs GEEVES DB")
print("=" * 100)

print(f"\n{'':=<100}")
print(f"SHORT TERM RENTAL INCOME")
print(f"{'':=<100}")
print(f"\n{'Year':<6} {'QBO STR':<18} {'Geeves Net':<18} {'Geeves Gross':<18} {'Diff (QBO-Net)':<18} {'Notes'}")
print("-" * 100)

for y in [2024, 2025, 2026]:
    qbo = float(qbo_str_yearly.get(y, 0))
    geeves_net = year_totals_geeves.get(y, {}).get('net', 0)
    geeves_gross = year_totals_geeves.get(y, {}).get('gross', 0)
    diff = qbo - geeves_net
    # QBO records net payouts from platforms (what hits the bank)
    # Geeves also records net payouts
    pct = (diff / qbo * 100) if qbo > 0 else 0
    status = 'CLOSE' if abs(pct) < 10 else 'MISMATCH'
    print(f"{y:<6} ${qbo:>12,.2f}   ${geeves_net:>12,.2f}   ${geeves_gross:>12,.2f}   ${diff:>12,.2f}   {status} ({pct:+.1f}%)")

# Bakery Income
print(f"\n{'':=<100}")
print(f"MAXFIELD BAKERY INCOME (QBO)")
print(f"{'':=<100}")
bakery_splits = ['Sale of Product - Maxfield Bakery Pass Through', 'Loan to Maxfield Bakery & Pastries']
bakery_income_qbo = df[df['Split'].isin(bakery_splits) & (df['amount_num'] > 0)]
bakery_by_year = bakery_income_qbo.groupby(['year', 'Split'])['amount_num'].sum()
print(bakery_by_year.to_string())

# Market Income
print(f"\n{'':=<100}")
print(f"MAXFIELD MARKET INCOME (QBO - Sales of Product Income)")
print(f"{'':=<100}")
market_income_qbo = df[(df['Split'] == 'Sales of Product Income') & (df['amount_num'] > 0)]
market_by_year = market_income_qbo.groupby('year')['amount_num'].sum()
print(market_by_year.to_string())

# Stripe comparison for Market/Bakery
print(f"\n\nGeeves Stripe Income for comparison:")
for r in stripe_biz:
    print(f"  {r['year']} | {r['business_vertical']:<20} | Gross: ${float(r['gross'] or 0):,.2f}")

# === FIELDS IN QBO NOT IN GEEVES ===
print(f"\n\n" + "=" * 100)
print(f"FIELDS IN QBO CSV NOT CURRENTLY IN GEEVES DB")
print(f"=" * 100)
print(f"""
QBO CSV Fields vs Geeves DB:

1. Transaction type (Journal Entry, Expense, Deposit, Transfer, etc.)
   → Geeves has 'type' in stripe_transactions but NOT in bank transaction tables

2. Num (Check/Invoice number)
   → NOT in Geeves - useful for reconciliation

3. Posting (Y/N)
   → NOT in Geeves - indicates if posted to books

4. Split (QBO Category/Account)
   → Geeves has 'business_vertical' and 'qbo_expense_category' but not the exact QBO account name

5. A/P paid (Unpaid/Paid status)
   → NOT in Geeves - accounts payable tracking

6. Created on / Created by (audit trail)
   → NOT in Geeves - QBO audit metadata

7. Customer (VRBO, Airbnb, etc.)
   → Geeves has platform in property_bookings but not in bank transactions

8. Vendor (Google, Town of Hector, etc.)
   → NOT in Geeves as a separate field - embedded in description

9. Account type (Bank, Credit Card, Equity)
   → Geeves has separate tables per account type

10. Payment method (Wire Transfer, etc.)
    → NOT in Geeves

11. Account full name (hierarchical account path)
    → NOT in Geeves

12. Due date
    → NOT in Geeves

KEY GAPS:
- QBO has the 'Split' field which maps to the Chart of Accounts category
- QBO has Customer/Vendor separation
- QBO has check numbers and payment methods
- QBO has audit trail (created by/when)
""")

