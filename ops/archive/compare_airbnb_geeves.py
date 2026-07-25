#!/usr/bin/env python3
"""Compare Airbnb export data with Geeves DB to find gaps and enrichment opportunities."""
import mysql.connector, subprocess, pandas as pd
from urllib.parse import urlparse

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

# Get ALL Airbnb platforms
cursor.execute('''
    SELECT pp.id, pp.propertyId, pp.platform, pp.displayName, p.name as propName
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.platform = 'airbnb'
''')
platforms = cursor.fetchall()
print('All Airbnb platforms:')
for p in platforms:
    print(f'  {p["id"]} | {p["propName"]} | {p["displayName"]}')

# Get ALL 2024 Airbnb bookings
cursor.execute('''
    SELECT pb.id, pb.guestName, pb.confirmationNumber, 
           COALESCE(pb.netAmount,0) as net, COALESCE(pb.totalPrice,0) as gross,
           FROM_UNIXTIME(pb.checkIn/1000) as checkIn, 
           FROM_UNIXTIME(pb.checkOut/1000) as checkOut,
           pp.displayName, p.name as propName, pp.id as platformId
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'airbnb'
    AND YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    ORDER BY pb.checkIn
''')
results = cursor.fetchall()
print(f'\nAll 2024 Airbnb bookings in Geeves ({len(results)}):')
geeves_confs = {}
for r in results:
    conf = r['confirmationNumber'] or 'None'
    geeves_confs[conf] = r
    print(f'  {r["checkIn"]} | {r["propName"]:<30} | {str(r["guestName"]):<22} | Net: ${float(r["net"]):>8,.2f} | Conf: {conf}')

# Load Airbnb exports
df1 = pd.read_csv('airbnb_.csv', encoding='utf-8-sig')
df2 = pd.read_csv('airbnb_01_2024-07_2026.csv', encoding='utf-8-sig')

res1 = df1[df1['Type'] == 'Reservation'].copy()
res1['start_dt'] = pd.to_datetime(res1['Start date'], format='%m/%d/%Y')
res1_2024 = res1[res1['start_dt'].dt.year == 2024]

res2 = df2[df2['Type'] == 'Reservation'].copy()
res2['start_dt'] = pd.to_datetime(res2['Start date'], format='%m/%d/%Y')
res2_2024 = res2[res2['start_dt'].dt.year == 2024]

all_export = pd.concat([res1_2024, res2_2024])
export_confs = set(all_export['Confirmation code'].values)

print(f'\n\nAirbnb Export: {len(all_export)} reservations')
print(f'Geeves DB: {len(results)} bookings')

# Find what's in export but not in Geeves
geeves_conf_set = set(geeves_confs.keys()) - {'None'}
missing_from_geeves = export_confs - geeves_conf_set
in_both = export_confs & geeves_conf_set

print(f'\nIn BOTH: {len(in_both)}')
print(f'In export but NOT in Geeves: {len(missing_from_geeves)}')
print(f'In Geeves but NOT in export (excl None): {len(geeves_conf_set - export_confs)}')

# Detail what's missing from Geeves
print(f'\n\nMISSING FROM GEEVES ({len(missing_from_geeves)} bookings):')
missing_df = all_export[all_export['Confirmation code'].isin(missing_from_geeves)].sort_values('start_dt')
total_missing_amount = 0
for _, r in missing_df.iterrows():
    total_missing_amount += r['Amount']
    print(f'  {r["Start date"]}-{r["End date"]} | {r["Guest"]:<25} | {r["Listing"][:40]:<40} | ${r["Amount"]:>8,.2f} | {r["Confirmation code"]}')
print(f'  TOTAL MISSING: ${total_missing_amount:,.2f}')

# Check amount mismatches for bookings in both
print(f'\n\nAMOUNT COMPARISON (in both, checking for enrichment):')
enrichment_needed = []
for _, r in all_export[all_export['Confirmation code'].isin(in_both)].iterrows():
    conf = r['Confirmation code']
    geeves_booking = geeves_confs[conf]
    geeves_net = float(geeves_booking['net'])
    export_amount = r['Amount']
    diff = abs(geeves_net - export_amount)
    if diff > 1:  # More than $1 difference
        enrichment_needed.append((conf, r['Guest'], geeves_net, export_amount, diff))
        print(f'  {conf} | {r["Guest"]:<20} | Geeves: ${geeves_net:>8,.2f} | Export: ${export_amount:>8,.2f} | Diff: ${diff:>8,.2f}')

if not enrichment_needed:
    print('  All matching bookings have consistent amounts!')
else:
    print(f'  {len(enrichment_needed)} bookings need amount correction')

# Summary by property
print(f'\n\nSUMMARY - WHAT NEEDS TO HAPPEN:')
print(f'  1. Add {len(missing_from_geeves)} missing bookings to Geeves')
print(f'     Total value: ${total_missing_amount:,.2f}')
print(f'  2. Fix {len(enrichment_needed)} bookings with wrong amounts')

# Map missing to properties
penthouse_listings = ['Stunning Lake View Penthouse on Seneca Wine Trail', 
                      'Stunning Lake View Penthouse on Seneca Waterfront',
                      'Lovely Lakeside 2 Bedroom Flat']
missing_ph = missing_df[missing_df['Listing'].isin(penthouse_listings)]
missing_ss = missing_df[missing_df['Listing'].str.contains('Studio', na=False)]
missing_ab = missing_df[missing_df['Listing'].str.contains('Artist|Bohemian', na=False)]

print(f'\n  Missing by property:')
print(f'    Penthouse: {len(missing_ph)} bookings, ${missing_ph["Amount"].sum():,.2f}')
print(f'    Sunset Studio: {len(missing_ss)} bookings, ${missing_ss["Amount"].sum():,.2f}')
print(f'    Artiste\'s: {len(missing_ab)} bookings, ${missing_ab["Amount"].sum():,.2f}')

conn.close()
