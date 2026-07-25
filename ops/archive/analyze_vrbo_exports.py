import pandas as pd
import mysql.connector
import subprocess
from urllib.parse import urlparse

# Parse VRBO Payout Summary reports (both current and deprecated)
print("="*80)
print("VRBO PAYOUT SUMMARY ANALYSIS")
print("="*80)

# Current VRBO account
current_payout = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/PayoutSummaryReport_2024-01-01_2026-07-04 - current vrbo.csv')
print(f"\nCURRENT VRBO ACCOUNT:")
print(f"  Properties: {current_payout['Address'].unique().tolist()}")
print(f"  Total reservations: {len(current_payout)}")
print(f"  Property IDs: {current_payout['Property ID'].unique().tolist()}")

# Parse dates
current_payout['CheckIn_dt'] = pd.to_datetime(current_payout['Check-in'], format='%B %d, %Y', errors='coerce')
current_payout['Payout_dt'] = pd.to_datetime(current_payout['Payout date'], format='%B %d, %Y', errors='coerce')

# 2024 bookings
current_2024 = current_payout[current_payout['CheckIn_dt'].dt.year == 2024]
print(f"\n  2024 Reservations: {len(current_2024)}")
print(f"  2024 Gross: ${current_2024['Gross booking amount'].astype(float).sum():,.2f}")
print(f"  2024 Payout: ${current_2024['Payout'].astype(float).sum():,.2f}")
print(f"  2024 Deductions: ${current_2024['Deductions'].astype(float).sum():,.2f}")

print("\n  2024 Bookings by Property:")
for prop in current_2024['Address'].unique():
    prop_data = current_2024[current_2024['Address'] == prop]
    print(f"    {prop}: {len(prop_data)} bookings, Gross ${prop_data['Gross booking amount'].astype(float).sum():,.2f}, Payout ${prop_data['Payout'].astype(float).sum():,.2f}")

print("\n  2024 Current VRBO - All Reservations:")
for _, row in current_2024.iterrows():
    print(f"    {row['Reservation ID']} | {row['Traveler First Name']} {row['Traveler Last Name']} | {row['Check-in']} - {row['Check-out']} | {row['Address']} | Gross: ${float(row['Gross booking amount']):,.2f} | Payout: ${float(row['Payout']):,.2f}")

# Deprecated VRBO account
print("\n" + "-"*80)
deprecated_payout = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/PayoutSummaryReport_2024-01-01_2026-07-04.csv - deprecated vrbo.csv')
print(f"\nDEPRECATED VRBO ACCOUNT:")
print(f"  Properties: {deprecated_payout['Address'].unique().tolist()}")
print(f"  Total reservations: {len(deprecated_payout)}")
print(f"  Property IDs: {deprecated_payout['Property ID'].unique().tolist()}")

deprecated_payout['CheckIn_dt'] = pd.to_datetime(deprecated_payout['Check-in'], format='%B %d, %Y', errors='coerce')
deprecated_payout['Payout_dt'] = pd.to_datetime(deprecated_payout['Payout date'], format='%B %d, %Y', errors='coerce')

deprecated_2024 = deprecated_payout[deprecated_payout['CheckIn_dt'].dt.year == 2024]
print(f"\n  2024 Reservations: {len(deprecated_2024)}")
print(f"  2024 Gross: ${deprecated_2024['Gross booking amount'].astype(float).sum():,.2f}")
print(f"  2024 Payout: ${deprecated_2024['Payout'].astype(float).sum():,.2f}")

print("\n  2024 Bookings by Property:")
for prop in deprecated_2024['Address'].unique():
    prop_data = deprecated_2024[deprecated_2024['Address'] == prop]
    print(f"    {prop}: {len(prop_data)} bookings, Gross ${prop_data['Gross booking amount'].astype(float).sum():,.2f}, Payout ${prop_data['Payout'].astype(float).sum():,.2f}")

print("\n  2024 Deprecated VRBO - All Reservations:")
for _, row in deprecated_2024.iterrows():
    print(f"    {row['Reservation ID']} | {row['Traveler First Name']} {row['Traveler Last Name']} | {row['Check-in']} - {row['Check-out']} | {row['Address']} | Gross: ${float(row['Gross booking amount']):,.2f} | Payout: ${float(row['Payout']):,.2f}")

# Combined totals
print("\n" + "="*80)
print("COMBINED VRBO 2024 TOTALS:")
combined_gross = current_2024['Gross booking amount'].astype(float).sum() + deprecated_2024['Gross booking amount'].astype(float).sum()
combined_payout = current_2024['Payout'].astype(float).sum() + deprecated_2024['Payout'].astype(float).sum()
combined_count = len(current_2024) + len(deprecated_2024)
print(f"  Total Reservations: {combined_count}")
print(f"  Total Gross: ${combined_gross:,.2f}")
print(f"  Total Payout: ${combined_payout:,.2f}")
print(f"  QBO VRBO deposits: $11,576")
print(f"  Difference: ${combined_payout - 11576:+,.2f}")

# Now check Geeves DB
print("\n" + "="*80)
print("CROSS-REFERENCE WITH GEEVES DB:")
print("="*80)

result = subprocess.run(
    ['bash', '-c', "cat /proc/$(pgrep -f 'node.*server' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL | cut -d= -f2-"],
    capture_output=True, text=True
)
db_url = result.stdout.strip()
parsed = urlparse(db_url)
conn = mysql.connector.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl_disabled=False
)
cursor = conn.cursor(dictionary=True)

# Get all VRBO bookings from Geeves for 2024
cursor.execute("""
    SELECT pb.confirmationNumber, pb.guestName, pb.checkIn, pb.checkOut, 
           pb.totalPrice, pb.netAmount, pb.bookingStatus, p.name as property
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'vrbo'
    AND YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    ORDER BY pb.checkIn
""")
geeves_vrbo = cursor.fetchall()
print(f"\nGeeves VRBO 2024 bookings: {len(geeves_vrbo)}")
for row in geeves_vrbo:
    from datetime import datetime
    checkin = datetime.fromtimestamp(int(row['checkIn'])/1000).strftime('%Y-%m-%d')
    print(f"  {row['confirmationNumber']} | {row['guestName']} | {checkin} | {row['property']} | ${float(row['netAmount'] or 0):,.2f} | {row['bookingStatus']}")

# Cross-reference: which VRBO export bookings are NOT in Geeves?
geeves_confs = set(r['confirmationNumber'] for r in geeves_vrbo)
all_vrbo_2024 = pd.concat([current_2024, deprecated_2024])

print(f"\n\nMISSING FROM GEEVES (in VRBO export but not in DB):")
missing = []
for _, row in all_vrbo_2024.iterrows():
    res_id = row['Reservation ID']
    if res_id not in geeves_confs:
        payout = float(row['Payout'])
        print(f"  {res_id} | {row['Traveler First Name']} {row['Traveler Last Name']} | {row['Check-in']} - {row['Check-out']} | {row['Address']} | Payout: ${payout:,.2f}")
        missing.append(row)

print(f"\n  Total missing: {len(missing)} bookings")
if missing:
    missing_df = pd.DataFrame(missing)
    print(f"  Missing payout total: ${missing_df['Payout'].astype(float).sum():,.2f}")

conn.close()
