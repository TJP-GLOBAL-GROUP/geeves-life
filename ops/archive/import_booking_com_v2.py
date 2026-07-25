#!/usr/bin/env python3
"""Import Booking.com reservations into Geeves property_bookings DB (correct schema)."""
import pandas as pd
import mysql.connector
import subprocess
from urllib.parse import urlparse
from datetime import datetime
import hashlib
import uuid

# --- Database connection ---
def get_db_url():
    result = subprocess.run(
        ['bash', '-c', "cat /proc/$(pgrep -f 'node.*server' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL | cut -d= -f2-"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

db_url = get_db_url()
parsed = urlparse(db_url)
conn = mysql.connector.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl_disabled=False
)
cursor = conn.cursor(dictionary=True)

# --- Read Booking.com XLS ---
xls_path = '/home/ubuntu/tax_prep/gdrive_data/booking_com/Reservations_2024-01-01_2026-12-31.xls'
df = pd.read_excel(xls_path)
df['arrival_dt'] = pd.to_datetime(df['Arrival'], format='mixed')
df['departure_dt'] = pd.to_datetime(df['Departure'], format='mixed')
print(f"Loaded {len(df)} reservations from Booking.com XLS")

# --- Get properties ---
cursor.execute("SELECT id, name FROM properties WHERE isActive = 1")
properties = {r['name']: r['id'] for r in cursor.fetchall()}
print(f"\nProperties: {properties}")

# --- Get platforms ---
cursor.execute("SELECT id, propertyId, platform, displayName FROM property_platforms")
platforms = cursor.fetchall()
print(f"\nAll platforms:")
for p in platforms:
    print(f"  {p['id']} | {p['platform']} | {p['displayName'] or 'N/A'} | prop: {p['propertyId']}")

# --- Map Booking.com property names to Geeves ---
# From the XLS: "Bohemian Lodge - Artist's Boutique", "The Seneca Sunset Suites", "Morabeza - A Tropical Seneca Haven"
BOOKING_TO_PROPERTY = {}
for name, pid in properties.items():
    if 'Artiste' in name or 'Artist' in name:
        BOOKING_TO_PROPERTY["Bohemian Lodge - Artist's Boutique"] = pid
    elif 'Sunset' in name:
        BOOKING_TO_PROPERTY["The Seneca Sunset Suites"] = pid
    elif 'Morabeza' in name:
        BOOKING_TO_PROPERTY["Morabeza - A Tropical Seneca Haven"] = pid

print(f"\nProperty mapping: {BOOKING_TO_PROPERTY}")

# --- Find/create Booking.com platforms ---
booking_platforms = {}  # propertyId -> platformId
for p in platforms:
    if p['platform'] == 'booking_com':
        booking_platforms[p['propertyId']] = p['id']

print(f"\nExisting Booking.com platforms: {booking_platforms}")

# Create missing Booking.com platforms
for bk_name, prop_id in BOOKING_TO_PROPERTY.items():
    if prop_id not in booking_platforms:
        platform_id = str(uuid.uuid4())[:21]
        display_name = bk_name.split(' - ')[0] + ' - Booking.com' if ' - ' in bk_name else bk_name + ' - Booking.com'
        cursor.execute("""
            INSERT INTO property_platforms (id, propertyId, platform, displayName, isActive, createdAt, updatedAt)
            VALUES (%s, %s, 'booking_com', %s, 1, NOW(), NOW())
        """, (platform_id, prop_id, display_name))
        booking_platforms[prop_id] = platform_id
        print(f"  Created platform: {display_name} ({platform_id})")

conn.commit()

# --- Check existing bookings ---
cursor.execute("""
    SELECT confirmationNumber FROM property_bookings 
    WHERE platformId IN (SELECT id FROM property_platforms WHERE platform = 'booking_com')
""")
existing_conf = set(str(r['confirmationNumber']) for r in cursor.fetchall() if r['confirmationNumber'])
print(f"\nExisting Booking.com bookings in DB: {len(existing_conf)}")

# --- Import ---
imported = 0
skipped = 0
errors = 0

for _, row in df.iterrows():
    bk_property = row['Property Name']
    
    if bk_property not in BOOKING_TO_PROPERTY:
        print(f"  SKIP: Unknown property '{bk_property}'")
        errors += 1
        continue
    
    property_id = BOOKING_TO_PROPERTY[bk_property]
    platform_id = booking_platforms[property_id]
    
    # Check if already exists
    res_num = str(int(row['Reservation Number'])) if pd.notna(row['Reservation Number']) else None
    if res_num and res_num in existing_conf:
        skipped += 1
        continue
    
    # Status
    status_map = {'OK': 'confirmed', 'Canceled': 'cancelled', 'No-show': 'cancelled'}
    booking_status = status_map.get(row['Status'], 'confirmed')
    
    # Amounts
    gross = float(row['Total Payment']) if pd.notna(row['Total Payment']) else 0
    commission = float(row['Commission']) if pd.notna(row['Commission']) else 0
    net = gross - commission if gross > 0 else 0
    
    # Dates
    check_in = int(row['arrival_dt'].timestamp() * 1000)
    check_out = int(row['departure_dt'].timestamp() * 1000)
    nights = (row['departure_dt'] - row['arrival_dt']).days
    
    # Generate ID
    booking_id = hashlib.md5(f"bkcom-{res_num}-{property_id}".encode()).hexdigest()[:21]
    ical_uid = f"booking-com-{res_num}@geeves.life"
    
    try:
        cursor.execute("""
            INSERT INTO property_bookings (
                id, propertyId, platformId, icalUid, bookingType,
                checkIn, checkOut, guestName,
                totalPrice, commissionAmount, netAmount, currency,
                confirmationNumber, bookingStatus, dataSource,
                createdAt, updatedAt
            ) VALUES (
                %s, %s, %s, %s, 'booking',
                %s, %s, %s,
                %s, %s, %s, 'USD',
                %s, %s, 'email_only',
                NOW(), NOW()
            )
        """, (
            booking_id, property_id, platform_id, ical_uid,
            check_in, check_out, row['Booker Name'],
            gross, commission, net,
            res_num, booking_status
        ))
        imported += 1
        existing_conf.add(res_num)
    except Exception as e:
        print(f"  ERROR: {row['Booker Name']} ({res_num}): {e}")
        errors += 1

conn.commit()

print(f"\n{'='*60}")
print(f"IMPORT COMPLETE")
print(f"{'='*60}")
print(f"  Imported: {imported}")
print(f"  Skipped (already exists): {skipped}")
print(f"  Errors: {errors}")

# Verify
print(f"\nVerification - Booking.com in DB by year/property:")
cursor.execute("""
    SELECT 
        YEAR(FROM_UNIXTIME(pb.checkIn/1000)) as yr,
        p.name as property,
        pb.bookingStatus as status,
        COUNT(*) as cnt,
        SUM(pb.totalPrice) as gross,
        SUM(pb.netAmount) as net
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'booking_com'
    GROUP BY yr, p.name, pb.bookingStatus
    ORDER BY yr, p.name, pb.bookingStatus
""")
for row in cursor.fetchall():
    print(f"  {row['yr']} | {row['property']:<30} | {row['status']:<10} | {row['cnt']} bookings | Gross: ${float(row['gross'] or 0):,.2f} | Net: ${float(row['net'] or 0):,.2f}")

cursor.close()
conn.close()
