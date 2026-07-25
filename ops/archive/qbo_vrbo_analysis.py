import csv
from datetime import datetime
from collections import defaultdict
import io

qbo_file = '/home/ubuntu/tax_prep/qbo_transaction_list.csv'

with open(qbo_file, 'r', encoding='utf-8-sig') as f:
    lines = f.readlines()

header_idx = None
for i, line in enumerate(lines):
    if line.startswith('Date,'):
        header_idx = i
        break

data_text = ''.join(lines[header_idx:])
reader = csv.DictReader(io.StringIO(data_text))
rows = list(reader)

def safe_float(val):
    try:
        return float(val.replace(',', ''))
    except (ValueError, AttributeError):
        return 0.0

# VRBO 2024
vrbo_rows = [r for r in rows if 'VRBO' in str(r.get('Customer', '')).upper() or 'VRBO' in str(r.get('Name', '')).upper()]
vrbo_2024 = []
for r in vrbo_rows:
    try:
        d = datetime.strptime(r['Date'], '%m/%d/%Y')
        if d.year == 2024:
            vrbo_2024.append((d, r))
    except:
        pass

# Separate deposits from refunds and journal entries
vrbo_deposits = [(d, r) for d, r in vrbo_2024 if safe_float(r.get('Amount', '')) > 0 and r['Transaction type'] == 'Deposit']
vrbo_refunds = [(d, r) for d, r in vrbo_2024 if safe_float(r.get('Amount', '')) < 0]
vrbo_journals = [(d, r) for d, r in vrbo_2024 if r['Transaction type'] == 'Journal Entry']

dep_total = sum(safe_float(r['Amount']) for _, r in vrbo_deposits)
ref_total = sum(safe_float(r['Amount']) for _, r in vrbo_refunds)

print("VRBO 2024 SUMMARY:")
print(f"  Deposits: {len(vrbo_deposits)} | Total: ${dep_total:,.2f}")
print(f"  Refunds: {len(vrbo_refunds)} | Total: ${ref_total:,.2f}")
print(f"  Journal Entries: {len(vrbo_journals)} (all $0)")
print(f"  NET VRBO Income: ${dep_total + ref_total:,.2f}")

# By account
by_account = defaultdict(list)
for d, r in vrbo_deposits:
    by_account[r['Account name']].append((d, r))

print(f"\nVRBO 2024 Deposits by Account:")
for acct, items in by_account.items():
    acct_total = sum(safe_float(r['Amount']) for _, r in items)
    print(f"  {acct}: {len(items)} deposits, ${acct_total:,.2f}")

total_all = dep_total + ref_total
print(f"\n  Net VRBO 2024 income: ${total_all:,.2f}")

print(f"\nGeeves VRBO 2024:")
print(f"  Penthouse VRBO (Morabeza platform): 4 bookings, net $1,234")
print(f"  Penthouse VRBO (Richard on Airbnb platform): 1 booking, net $1,285")
print(f"  Sunset Studio VRBO: 9 bookings, net $2,066")
print(f"  TOTAL in Geeves: $4,585")
print(f"\n  GAP: ${total_all - 4585:,.2f}")

# Deposits by month
by_month = defaultdict(list)
for d, r in vrbo_deposits:
    by_month[d.strftime('%Y-%m')].append(safe_float(r['Amount']))

print(f"\nQBO VRBO deposits by month (2024):")
for month in sorted(by_month.keys()):
    amounts = by_month[month]
    print(f"  {month}: {len(amounts)} deposits, ${sum(amounts):,.2f}")

# Also get CBNA deposits (first few months)
print(f"\nCBNA VRBO deposits (Jan-Jun 2024):")
cbna_deposits = [(d, r) for d, r in vrbo_deposits if 'CBNA' in r.get('Account name', '')]
for d, r in sorted(cbna_deposits, key=lambda x: x[0]):
    print(f"  {r['Date']} | ${safe_float(r['Amount']):,.2f} | {r['Memo'][:55]}")

print(f"\nBoA Savings VRBO deposits (2024):")
boa_deposits = [(d, r) for d, r in vrbo_deposits if 'Bank of America' in r.get('Account name', '')]
for d, r in sorted(boa_deposits, key=lambda x: x[0]):
    print(f"  {r['Date']} | ${safe_float(r['Amount']):,.2f} | {r['Memo'][:55]}")

# Now Airbnb 2024
print("\n\n" + "=" * 80)
print("AIRBNB 2024 QBO ANALYSIS")
print("=" * 80)
airbnb_rows = [r for r in rows if 'Airbnb' in str(r.get('Customer', '')) or 'Airbnb' in str(r.get('Name', '')) or 'AIRBNB' in str(r.get('Memo', '')).upper()]
airbnb_2024 = []
for r in airbnb_rows:
    try:
        d = datetime.strptime(r['Date'], '%m/%d/%Y')
        if d.year == 2024:
            airbnb_2024.append((d, r))
    except:
        pass

airbnb_deposits_2024 = [(d, r) for d, r in airbnb_2024 if safe_float(r.get('Amount', '')) > 0 and r['Transaction type'] in ('Deposit', 'Sales Receipt')]
airbnb_dep_total = sum(safe_float(r['Amount']) for _, r in airbnb_deposits_2024)
print(f"Airbnb 2024 deposits: {len(airbnb_deposits_2024)} | Total: ${airbnb_dep_total:,.2f}")

by_month_airbnb = defaultdict(list)
for d, r in airbnb_deposits_2024:
    by_month_airbnb[d.strftime('%Y-%m')].append(safe_float(r['Amount']))

print(f"\nAirbnb deposits by month (2024):")
for month in sorted(by_month_airbnb.keys()):
    amounts = by_month_airbnb[month]
    print(f"  {month}: {len(amounts)} deposits, ${sum(amounts):,.2f}")

# Booking.com 2024
print("\n\n" + "=" * 80)
print("BOOKING.COM 2024 QBO ANALYSIS")
print("=" * 80)
booking_rows = [r for r in rows if 'Booking.com' in str(r.get('Customer', '')) or 'Booking.com' in str(r.get('Name', '')) or 'BOOKING.COM' in str(r.get('Memo', '')).upper()]
booking_2024 = []
for r in booking_rows:
    try:
        d = datetime.strptime(r['Date'], '%m/%d/%Y')
        if d.year == 2024:
            booking_2024.append((d, r))
    except:
        pass

print(f"Booking.com 2024 entries: {len(booking_2024)}")
for d, r in sorted(booking_2024, key=lambda x: x[0]):
    print(f"  {r['Date']} | {r['Transaction type']} | ${safe_float(r['Amount']):,.2f} | {r['Account name']} | {r['Memo'][:50]}")

# PayPal 2024
print("\n\n" + "=" * 80)
print("PAYPAL 2024 QBO ANALYSIS")
print("=" * 80)
paypal_rows = [r for r in rows if 'PayPal' in str(r.get('Customer', '')) or 'PayPal' in str(r.get('Name', '')) or 'PAYPAL' in str(r.get('Memo', '')).upper()]
paypal_2024 = []
for r in paypal_rows:
    try:
        d = datetime.strptime(r['Date'], '%m/%d/%Y')
        if d.year == 2024:
            paypal_2024.append((d, r))
    except:
        pass

print(f"PayPal 2024 entries: {len(paypal_2024)}")
for d, r in sorted(paypal_2024, key=lambda x: x[0]):
    print(f"  {r['Date']} | {r['Transaction type']} | ${safe_float(r['Amount']):,.2f} | {r['Account name']} | {r['Split']} | {r['Memo'][:50]}")
