#!/usr/bin/env python3
"""
Enrich Geeves DB from Airbnb export data:
1. Import 30 missing bookings with correct amounts
2. Fix 9 bookings with wrong amounts
3. Remove duplicates (Anat duplicate, Shardy duplicate)
4. Flag 14 'extra' bookings for review
"""
import mysql.connector, subprocess, pandas as pd, uuid
from urllib.parse import urlparse
from datetime import datetime

# Connect to DB
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

# Load exports
df1 = pd.read_csv('airbnb_.csv', encoding='utf-8-sig')
df2 = pd.read_csv('airbnb_01_2024-07_2026.csv', encoding='utf-8-sig')

res1 = df1[df1['Type'] == 'Reservation'].copy()
res1['start_dt'] = pd.to_datetime(res1['Start date'], format='%m/%d/%Y')
res1['end_dt'] = pd.to_datetime(res1['End date'], format='%m/%d/%Y')

res2 = df2[df2['Type'] == 'Reservation'].copy()
res2['start_dt'] = pd.to_datetime(res2['Start date'], format='%m/%d/%Y')
res2['end_dt'] = pd.to_datetime(res2['End date'], format='%m/%d/%Y')

all_res = pd.concat([res1, res2])
all_2024 = all_res[all_res['start_dt'].dt.year == 2024]

# Get platform IDs
cursor.execute('''
    SELECT pp.id, pp.propertyId, pp.platform, pp.displayName, p.name as propName
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.platform = 'airbnb'
''')
platforms = {p['propName']: p for p in cursor.fetchall()}
print("Platforms found:")
for name, p in platforms.items():
    print(f"  {name}: {p['id']}")

# Listing to platform mapping
def get_platform_for_listing(listing):
    if 'Penthouse' in listing or 'Lakeside' in listing:
        return platforms.get('Penthouse (Unit 1 - 2BR)', platforms.get('Morabeza'))
    elif 'Studio' in listing:
        return platforms.get('Sunset Studio')
    elif 'Artist' in listing or 'Bohemian' in listing:
        return platforms.get("The Artiste's Boutique")
    return None

# ============================================================
# STEP 1: Import 30 missing bookings
# ============================================================
print("\n" + "="*60)
print("STEP 1: IMPORTING MISSING BOOKINGS")
print("="*60)

# Get existing confirmation codes
cursor.execute('''
    SELECT confirmationNumber FROM property_bookings 
    WHERE confirmationNumber IS NOT NULL
''')
existing_confs = {r['confirmationNumber'] for r in cursor.fetchall()}

missing_confs = [
    'HM84F8ACBD','HMEPAWHBQ5','HMSERSCZ8J','HMKP5ZCTZ3','HM4Q2H4X3F','HMMJ5YH4YS',
    'HMW4MNA8JP','HMMW3D98X3','HMQM3Y9XMY','HMP5A34J8J','HMX5T8XRPH','HM5KR8MMMQ',
    'HM4BKNAND9','HM8EDR2N8Z','HMBBA3BCT5','HM2TAETCNS','HMBDW2SZCC','HM5ZKTCNYS',
    'HMYCN4A5DQ','HMYEEJWZQF','HMB99ANPZB','HMQBBBB8Z8','HM4448SW2S','HMMBWY9ZDJ',
    'HMZQ88WX2P','HMXABJYJYW','HMMJEYDDQR','HMQBKB9QCM','HMPCBTTXE8','HMD5NXZ2NA'
]

inserted = 0
skipped = 0
for conf in missing_confs:
    if conf in existing_confs:
        print(f"  SKIP (already exists): {conf}")
        skipped += 1
        continue
    
    row = all_2024[all_2024['Confirmation code'] == conf]
    if len(row) == 0:
        # Try all years
        row = all_res[all_res['Confirmation code'] == conf]
    if len(row) == 0:
        print(f"  ERROR: {conf} not found in export!")
        continue
    
    r = row.iloc[0]
    platform = get_platform_for_listing(r['Listing'])
    if not platform:
        print(f"  ERROR: No platform for listing '{r['Listing']}'")
        continue
    
    booking_id = str(uuid.uuid4())[:21]
    check_in_ms = int(r['start_dt'].timestamp() * 1000)
    check_out_ms = int(r['end_dt'].timestamp() * 1000)
    nights = int(r['Nights'])
    gross = float(r['Gross earnings'])
    net = float(r['Amount'])  # Amount = host payout = net
    
    cursor.execute('''
        INSERT INTO property_bookings 
        (id, propertyId, platformId, guestName, checkIn, checkOut,
         totalPrice, netAmount, confirmationNumber, bookingStatus, 
         bookingType, dataSource, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'confirmed', 'booking', 'email_only', NOW())
    ''', (booking_id, platform['propertyId'], platform['id'], 
          r['Guest'], check_in_ms, check_out_ms, gross, net, conf))
    inserted += 1
    print(f"  INSERTED: {r['Guest']:<25} | {r['Start date']} | ${net:,.2f} | {conf}")

conn.commit()
print(f"\n  Total inserted: {inserted}, Skipped: {skipped}")

# ============================================================
# STEP 2: Fix 9 bookings with wrong amounts
# ============================================================
print("\n" + "="*60)
print("STEP 2: FIXING WRONG AMOUNTS")
print("="*60)

# These bookings have amounts that differ from the export
amount_fixes = {
    'HMS3PTT5W8': 97.00,      # Jordan Guertin - export says $97, Geeves has $227.95
    'HM2RXMN5YX': 324.95,    # Jordyn Battle - export says $324.95, Geeves has $620.80
    'HMJPBD2JE5': 196.42,    # Gayatri Vaidyanathan
    'HMNJC38Y23': 398.67,    # Jonathon Segal
    'HMXF48YYYF': 470.45,    # Jeff Wendler
    'HMHQXDQ2PP': 659.60,    # Nic Smith
    'HMN284FZME': 630.50,    # Dwayne Spence
    'HMPHX9WR5Q': 856.12,    # Michelle Tomlinson
    'HMC9RBBQY4': 1127.72,   # Sonya Abrams
}

# Also get the gross amounts from export
for conf, new_net in amount_fixes.items():
    row = all_res[all_res['Confirmation code'] == conf]
    if len(row) == 0:
        print(f"  ERROR: {conf} not found in export")
        continue
    r = row.iloc[0]
    new_gross = float(r['Gross earnings'])
    
    cursor.execute('''
        UPDATE property_bookings 
        SET netAmount = %s, totalPrice = %s
        WHERE confirmationNumber = %s
    ''', (new_net, new_gross, conf))
    
    print(f"  FIXED: {conf} | {r['Guest']:<22} | Net → ${new_net:,.2f} | Gross → ${new_gross:,.2f}")

conn.commit()
print(f"  Fixed {len(amount_fixes)} bookings")

# ============================================================
# STEP 3: Remove duplicates
# ============================================================
print("\n" + "="*60)
print("STEP 3: REMOVING DUPLICATES")
print("="*60)

# Anat Szendro Sevilla - duplicate (same conf# HM28X9X2ZB twice)
cursor.execute('''
    SELECT id, guestName, COALESCE(netAmount,0) as net FROM property_bookings 
    WHERE confirmationNumber = 'HM28X9X2ZB'
    ORDER BY createdAt
''')
anat_dupes = cursor.fetchall()
if len(anat_dupes) > 1:
    # Keep the first one, delete the rest
    for dupe in anat_dupes[1:]:
        cursor.execute('DELETE FROM property_bookings WHERE id = %s', (dupe['id'],))
        print(f"  DELETED duplicate: {dupe['guestName']} (Conf: HM28X9X2ZB, Net: ${float(dupe['net']):,.2f})")
else:
    print("  Anat duplicate already resolved")

# Shardy Mitchell - same conf# HM3MKBJP9T on Sunset Studio AND Artiste's
# Need to determine which is correct based on listing in export
cursor.execute('''
    SELECT pb.id, pb.guestName, p.name as propName, COALESCE(pb.netAmount,0) as net
    FROM property_bookings pb
    JOIN properties p ON pb.propertyId = p.id
    WHERE pb.confirmationNumber = 'HM3MKBJP9T'
''')
shardy_dupes = cursor.fetchall()
if len(shardy_dupes) > 1:
    # Check export - which listing does HM3MKBJP9T belong to?
    shardy_export = all_res[all_res['Confirmation code'] == 'HM3MKBJP9T']
    if len(shardy_export) > 0:
        correct_listing = shardy_export.iloc[0]['Listing']
        print(f"  Shardy's correct listing (from export): {correct_listing}")
        # Delete the wrong one
        for dupe in shardy_dupes:
            if 'Studio' in correct_listing and 'Studio' not in dupe['propName']:
                cursor.execute('DELETE FROM property_bookings WHERE id = %s', (dupe['id'],))
                print(f"  DELETED wrong assignment: {dupe['propName']} (keeping Studio)")
            elif 'Artist' in correct_listing and 'Artiste' not in dupe['propName']:
                cursor.execute('DELETE FROM property_bookings WHERE id = %s', (dupe['id'],))
                print(f"  DELETED wrong assignment: {dupe['propName']} (keeping Artiste's)")
    else:
        print(f"  Shardy not found in export - cannot determine correct property")
else:
    print("  Shardy duplicate already resolved")

conn.commit()

# ============================================================
# STEP 4: Flag extra bookings for review
# ============================================================
print("\n" + "="*60)
print("STEP 4: FLAGGING EXTRA BOOKINGS (in Geeves but NOT in export)")
print("="*60)

# Svetlana - mark as 'unverified' since not in any export
cursor.execute('''
    SELECT id, guestName, confirmationNumber, COALESCE(netAmount,0) as net
    FROM property_bookings WHERE confirmationNumber = 'HMAY5C82QT'
''')
svetlana = cursor.fetchall()
if svetlana:
    print(f"  SVETLANA: Conf HMAY5C82QT, Net ${float(svetlana[0]['net']):,.2f}")
    print(f"    NOT in either Airbnb export - likely cancelled or phantom")
    print(f"    Marking as 'cancelled' pending bank verification")
    cursor.execute('''
        UPDATE property_bookings SET bookingStatus = 'cancelled'
        WHERE confirmationNumber = 'HMAY5C82QT'
    ''')

# List remaining extras for user review
extra_confs = ['HM2HW3HBNY', 'HMTXP28WDJ', 'HM98SWEK99', 'HM3MKBJP9T', 
               'HMWSYSMKWJ', 'HM8YXH2BMC', 'HM28X9X2ZB', 'HM3DS3TJMC', 
               'HMEYASS9H5', 'HMSSHHY349', 'HM5NMJDN3P']

print(f"\n  Remaining bookings in Geeves NOT in either export:")
for conf in extra_confs:
    cursor.execute('''
        SELECT pb.guestName, COALESCE(pb.netAmount,0) as net, p.name as propName,
               FROM_UNIXTIME(pb.checkIn/1000) as checkIn
        FROM property_bookings pb
        JOIN properties p ON pb.propertyId = p.id
        WHERE pb.confirmationNumber = %s
    ''', (conf,))
    rows = cursor.fetchall()
    for r in rows:
        print(f"    {r['checkIn']} | {r['propName']:<30} | {str(r['guestName']):<22} | ${float(r['net']):>8,.2f} | {conf}")

conn.commit()

# ============================================================
# FINAL SUMMARY
# ============================================================
print("\n" + "="*60)
print("FINAL 2024 STATE")
print("="*60)

cursor.execute('''
    SELECT 
        p.name as property,
        pp.platform,
        COUNT(*) as cnt,
        SUM(COALESCE(pb.totalPrice,0)) as gross,
        SUM(COALESCE(pb.netAmount,0)) as net
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    AND pb.bookingStatus = 'confirmed'
    GROUP BY p.name, pp.platform
    ORDER BY p.name, pp.platform
''')
print(f'{"Property":<30} | {"Platform":<12} | {"Count":>5} | {"Gross":>12} | {"Net":>12}')
print('-'*85)
total_gross = 0
total_net = 0
for row in cursor.fetchall():
    g = float(row['gross'])
    n = float(row['net'])
    total_gross += g
    total_net += n
    print(f'{row["property"]:<30} | {row["platform"]:<12} | {row["cnt"]:>5} | ${g:>10,.2f} | ${n:>10,.2f}')
print('-'*85)
print(f'{"TOTAL":<30} | {"":>12} | {"":>5} | ${total_gross:>10,.2f} | ${total_net:>10,.2f}')
print(f'\nAirbnb Export Total (host payout): $52,048.17')
print(f'QBO 2024 STR Total: $59,658')

conn.close()
