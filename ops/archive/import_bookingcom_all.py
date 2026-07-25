import pandas as pd
import mysql.connector, subprocess, uuid
from urllib.parse import urlparse
from datetime import datetime

# Get DB connection
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

# Get property IDs
cursor.execute("SELECT id, name FROM properties")
properties = {r['name']: r['id'] for r in cursor.fetchall()}
penthouse_id = properties.get('Penthouse (Unit 1 - 2BR)')
studio_id = properties.get('Sunset Studio')
artiste_id = properties.get("The Artiste's Boutique")

# Get existing Booking.com platforms
cursor.execute("SELECT id, propertyId, platform FROM property_platforms WHERE platform = 'booking_com'")
existing_platforms = cursor.fetchall()
print(f"Existing Booking.com platforms:")
for p in existing_platforms:
    prop_name = [k for k, v in properties.items() if v == p['propertyId']]
    print(f"  {p['id']} → {prop_name[0] if prop_name else p['propertyId']}")

# Map existing platforms
platform_by_property = {p['propertyId']: p['id'] for p in existing_platforms}

now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# Create Booking.com platform for Penthouse if missing
if penthouse_id not in platform_by_property:
    penthouse_booking_platform = str(uuid.uuid4())[:21]
    cursor.execute("""
        INSERT INTO property_platforms (id, propertyId, platform, displayName, icalUrl, isActive, createdAt, updatedAt, notificationEmail, emailScrapingEnabled)
        VALUES (%s, %s, 'booking_com', 'Morabeza - A Tropical Seneca Haven', '', 1, %s, %s, 'tarik@maxfieldmarket.com', 1)
    """, (penthouse_booking_platform, penthouse_id, now, now))
    platform_by_property[penthouse_id] = penthouse_booking_platform
    print(f"Created Booking.com platform for Penthouse: {penthouse_booking_platform}")

# Studio should already exist from earlier import
studio_booking_platform = platform_by_property.get(studio_id)
if not studio_booking_platform:
    studio_booking_platform = str(uuid.uuid4())[:21]
    cursor.execute("""
        INSERT INTO property_platforms (id, propertyId, platform, displayName, icalUrl, isActive, createdAt, updatedAt, notificationEmail, emailScrapingEnabled)
        VALUES (%s, %s, 'booking_com', 'The Seneca Sunset Suites', '', 1, %s, %s, 'tarik@maxfieldmarket.com', 1)
    """, (studio_booking_platform, studio_id, now, now))
    platform_by_property[studio_id] = studio_booking_platform
    print(f"Created Booking.com platform for Sunset Studio: {studio_booking_platform}")

conn.commit()

# Read the new Booking.com file
df = pd.read_excel('/home/ubuntu/tax_prep/gdrive_data/Reservations_2024-01-01_2026-12-31.xls')
df['Arrival_parsed'] = pd.to_datetime(df['Arrival'], format='%B %d, %Y', errors='coerce')
df['Departure_parsed'] = pd.to_datetime(df['Departure'], format='%B %d, %Y', errors='coerce')

# Property name to Geeves property mapping
property_name_map = {
    'The Seneca Sunset Suites': studio_id,
    'Morabeza - A Tropical Seneca Haven': penthouse_id,
    "Bohemian Lodge - Artist's Boutique": artiste_id,
}

imported = 0
skipped = 0
for _, row in df.iterrows():
    prop_id = property_name_map.get(row['Property Name'])
    if not prop_id:
        continue
    
    platform_id = platform_by_property.get(prop_id)
    if not platform_id:
        print(f"  WARNING: No platform for {row['Property Name']}")
        continue
    
    # Check for duplicates by confirmation number
    conf_num = str(row['Reservation Number'])
    cursor.execute("SELECT id FROM property_bookings WHERE confirmationNumber = %s", (conf_num,))
    if cursor.fetchone():
        skipped += 1
        continue
    
    checkin_ms = int(row['Arrival_parsed'].timestamp() * 1000)
    checkout_ms = int(row['Departure_parsed'].timestamp() * 1000)
    total = float(row['Total Payment']) if pd.notna(row['Total Payment']) else 0
    commission = float(row['Commission']) if pd.notna(row['Commission']) else 0
    net = total - commission
    
    status = 'confirmed' if row['Status'] == 'OK' else 'cancelled'
    
    booking_id = str(uuid.uuid4())[:21]
    cursor.execute("""
        INSERT INTO property_bookings (id, propertyId, platformId, guestName, checkIn, checkOut,
        totalPrice, netAmount, confirmationNumber, bookingStatus, createdAt, updatedAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        booking_id, prop_id, platform_id,
        row['Booker Name'], checkin_ms, checkout_ms,
        total, net, conf_num,
        status, now, now
    ))
    imported += 1

conn.commit()
print(f"\nImported {imported} new Booking.com bookings (skipped {skipped} duplicates)")

# Final state
cursor.execute("""
    SELECT 
        p.name as property,
        pb.bookingStatus,
        COUNT(*) as count,
        SUM(COALESCE(pb.totalPrice,0)) as gross,
        SUM(COALESCE(pb.netAmount,0)) as net
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'booking_com'
    GROUP BY p.name, pb.bookingStatus
    ORDER BY p.name, pb.bookingStatus
""")
rows = cursor.fetchall()
print(f"\n{'='*60}")
print("ALL BOOKING.COM DATA IN GEEVES:")
print("="*60)
for row in rows:
    print(f"  {row['property']:<30} | {row['bookingStatus']:<10} | {row['count']:>3} | Gross: ${float(row['gross']):>10,.2f} | Net: ${float(row['net']):>10,.2f}")

# 2024 specifically
print(f"\n\n2024 BOOKING.COM (confirmed only):")
cursor.execute("""
    SELECT 
        p.name as property,
        pb.guestName,
        pb.checkIn,
        pb.totalPrice,
        pb.netAmount,
        pb.bookingStatus
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'booking_com'
    AND pb.checkIn >= 1704067200000
    AND pb.checkIn < 1735689600000
    AND pb.bookingStatus = 'confirmed'
    ORDER BY pb.checkIn
""")
rows_2024 = cursor.fetchall()
total_net = 0
for row in rows_2024:
    net = float(row['netAmount']) if row['netAmount'] else 0
    total_net += net
    checkin = datetime.fromtimestamp(int(row['checkIn'])/1000).strftime('%Y-%m-%d')
    print(f"  {row['guestName']:<30} | {checkin} | {row['property']:<30} | Net: ${net:>8,.2f}")
print(f"  {'TOTAL':<30} | {'':10} | {'':30} | Net: ${total_net:>8,.2f}")

conn.close()
