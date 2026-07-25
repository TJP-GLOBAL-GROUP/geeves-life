import pandas as pd

df = pd.read_csv('qbo_transaction_list.csv', skiprows=3)
# Remove footer rows (TOTAL, timestamp, etc.)
df = df[df['Date'].notna()]
df = df[~df['Date'].astype(str).str.contains('TOTAL|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday', case=False, na=False)]
df['Date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y', errors='coerce')
df = df[df['Date'].notna()]
df_2024 = df[df['Date'].dt.year == 2024].copy()
df_2024['Amount'] = pd.to_numeric(df_2024['Amount'].astype(str).str.replace(',', '').str.replace('"', ''), errors='coerce')

# === BOOKING.COM (Stripe) IN 2024 ===
print("=" * 80)
print("BOOKING.COM (Stripe) IN 2024")
print("=" * 80)
mask_stripe = (df_2024['Memo'].astype(str).str.contains('Stripe|ST-|STRIPE', case=False, na=False) | 
               df_2024['Name'].astype(str).str.contains('Stripe|Booking', case=False, na=False))
booking_com = df_2024[mask_stripe]
print(f"Total entries: {len(booking_com)}")
for _, row in booking_com.sort_values('Date').iterrows():
    amt = row['Amount'] if pd.notna(row['Amount']) else 0
    memo = str(row['Memo'])[:50] if pd.notna(row['Memo']) else ""
    acct = str(row['Account name'])[:30] if pd.notna(row['Account name']) else ""
    print(f"  {row['Date'].strftime('%Y-%m-%d')} | ${amt:>10,.2f} | {acct:<30} | {memo}")

booking_h1 = booking_com[booking_com['Date'] < '2024-07-01']
booking_h2 = booking_com[booking_com['Date'] >= '2024-07-01']
print(f"\n  H1 2024 (Jan-Jun): {len(booking_h1)} entries, ${booking_h1['Amount'].sum():,.2f}")
print(f"  H2 2024 (Jul-Dec): {len(booking_h2)} entries, ${booking_h2['Amount'].sum():,.2f}")

# === AIRBNB DEPOSITS IN 2024 ===
print(f"\n\n{'=' * 80}")
print("AIRBNB DEPOSITS IN 2024")
print("=" * 80)
airbnb = df_2024[df_2024['Memo'].astype(str).str.contains('Airbnb', case=False, na=False) | 
                 df_2024['Name'].astype(str).str.contains('Airbnb', case=False, na=False)]
airbnb_deposits = airbnb[airbnb['Amount'] > 0]
print(f"Total Airbnb deposits: {len(airbnb_deposits)}, ${airbnb_deposits['Amount'].sum():,.2f}")

airbnb_h1 = airbnb_deposits[airbnb_deposits['Date'] < '2024-07-01']
airbnb_h2 = airbnb_deposits[airbnb_deposits['Date'] >= '2024-07-01']
print(f"  H1 2024 (Jan-Jun): {len(airbnb_h1)} deposits, ${airbnb_h1['Amount'].sum():,.2f}")
print(f"  H2 2024 (Jul-Dec): {len(airbnb_h2)} deposits, ${airbnb_h2['Amount'].sum():,.2f}")

print(f"\n  Monthly Airbnb deposits:")
for month in range(1, 13):
    m_data = airbnb_deposits[airbnb_deposits['Date'].dt.month == month]
    if len(m_data) > 0:
        print(f"    {month:02d}/2024: {len(m_data)} deposits, ${m_data['Amount'].sum():,.2f}")

print(f"\n  Airbnb deposits by account:")
for acct, grp in airbnb_deposits.groupby('Account name'):
    print(f"    {acct}: {len(grp)} deposits, ${grp['Amount'].sum():,.2f}")

# === Geeves Artiste's Boutique 2024 bookings check ===
print(f"\n\n{'=' * 80}")
print("GEEVES: ARTISTE'S BOUTIQUE 2024 BOOKINGS BY MONTH")
print("=" * 80)

import mysql.connector
from urllib.parse import urlparse

GEEVES_DB = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(GEEVES_DB)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False,
                               consume_results=True)
cur = conn.cursor(dictionary=True)

cur.execute("""
    SELECT pb.guestName, DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate,
           MONTH(FROM_UNIXTIME(pb.checkIn/1000)) as month,
           pb.totalPrice, pb.netAmount, pb.rawEmailSubject
    FROM property_bookings pb
    WHERE pb.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    AND pb.bookingStatus != 'cancelled'
    ORDER BY pb.checkIn
""")
artiste_2024 = cur.fetchall()

h1_bookings = [b for b in artiste_2024 if b['month'] <= 6]
h2_bookings = [b for b in artiste_2024 if b['month'] > 6]

print(f"\nH1 2024 (Jan-Jun): {len(h1_bookings)} bookings")
for b in h1_bookings:
    net = f"${float(b['netAmount']):,.2f}" if b['netAmount'] else "MISSING"
    print(f"  {b['checkInDate']} | {b['guestName']:<20} | Net: {net}")

print(f"\nH2 2024 (Jul-Dec): {len(h2_bookings)} bookings")
for b in h2_bookings:
    net = f"${float(b['netAmount']):,.2f}" if b['netAmount'] else "MISSING"
    print(f"  {b['checkInDate']} | {b['guestName']:<20} | Net: {net}")

h1_net = sum(float(b['netAmount'] or 0) for b in h1_bookings)
h2_net = sum(float(b['netAmount'] or 0) for b in h2_bookings)
print(f"\n  H1 Net: ${h1_net:,.2f}")
print(f"  H2 Net: ${h2_net:,.2f}")
print(f"  Total: ${h1_net + h2_net:,.2f}")

# Check: which email accounts have Artiste's Boutique platforms?
cur.execute("""
    SELECT pp.id, pp.platform, pp.notificationEmail, pp.displayName
    FROM property_platforms pp
    WHERE pp.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
""")
artiste_platforms = cur.fetchall()
print(f"\n\nArtiste's Boutique platforms:")
for p in artiste_platforms:
    print(f"  {p['platform']}: email={p['notificationEmail']} | display={p['displayName']} | id={p['id']}")

conn.close()
