import pandas as pd
import mysql.connector
import subprocess
from urllib.parse import urlparse
from datetime import datetime
import uuid

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

# Get property and platform IDs
cursor.execute("SELECT id, name FROM properties")
properties = {r['name']: r['id'] for r in cursor.fetchall()}
print("Properties:", {k: v[:8] for k, v in properties.items()})

cursor.execute("SELECT id, propertyId, platform FROM property_platforms WHERE platform = 'vrbo'")
platforms = cursor.fetchall()
print("VRBO platforms:", [(p['id'][:8], p['propertyId'][:8]) for p in platforms])

# Map platform IDs
penthouse_id = properties.get('Penthouse (Unit 1 - 2BR)')
sunset_id = properties.get('Sunset Studio')
artiste_id = properties.get("The Artiste's Boutique")

# Find VRBO platform for each property
vrbo_platforms = {}
for p in platforms:
    if p['propertyId'] == penthouse_id:
        vrbo_platforms['penthouse'] = p['id']
    elif p['propertyId'] == sunset_id:
        vrbo_platforms['sunset'] = p['id']
    elif p['propertyId'] == artiste_id:
        vrbo_platforms['artiste'] = p['id']

print(f"\nVRBO platform IDs:")
print(f"  Penthouse: {vrbo_platforms.get('penthouse', 'MISSING')}")
print(f"  Sunset Studio: {vrbo_platforms.get('sunset', 'MISSING')}")
print(f"  Artiste's: {vrbo_platforms.get('artiste', 'MISSING')}")

# If Artiste's doesn't have a VRBO platform, create one
if 'artiste' not in vrbo_platforms:
    artiste_vrbo_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO property_platforms (id, propertyId, platform, listingUrl, createdAt)
        VALUES (%s, %s, 'vrbo', '', NOW())
    """, (artiste_vrbo_id, artiste_id))
    vrbo_platforms['artiste'] = artiste_vrbo_id
    print(f"  Created Artiste's VRBO platform: {artiste_vrbo_id}")
    conn.commit()

# Load both VRBO payout summaries
current_payout = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/PayoutSummaryReport_2024-01-01_2026-07-04 - current vrbo.csv')
deprecated_payout = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/PayoutSummaryReport_2024-01-01_2026-07-04.csv - deprecated vrbo.csv')

# Property mapping from VRBO to Geeves
# Current VRBO:
#   Property 3001841 = "7 Dillsbury Ave" = Artiste's Boutique (Jamaica)
#   Property 3889059 = "4693 New York 414" = Sunset Studio
# Deprecated VRBO:
#   Property 2778727 = "4693 NY-414" = Penthouse
#   Property 2826390 = "4693 NY-414" (unit 3398402) = Sunset Studio (2nd listing)

def get_geeves_mapping(row, source):
    """Map VRBO property to Geeves property/platform"""
    prop_id = int(row['Property ID'])
    if source == 'current':
        if prop_id == 3001841:
            return artiste_id, vrbo_platforms['artiste']
        elif prop_id == 3889059:
            return sunset_id, vrbo_platforms['sunset']
    elif source == 'deprecated':
        if prop_id == 2778727:
            return penthouse_id, vrbo_platforms['penthouse']
        elif prop_id == 2826390:
            return sunset_id, vrbo_platforms['sunset']
    return None, None

# Get existing confirmation numbers to avoid duplicates
cursor.execute("SELECT confirmationNumber FROM property_bookings WHERE confirmationNumber IS NOT NULL")
existing_confs = set(r['confirmationNumber'] for r in cursor.fetchall())

# Process all VRBO bookings from both accounts
all_vrbo = []
for _, row in current_payout.iterrows():
    row_dict = row.to_dict()
    row_dict['_source'] = 'current'
    all_vrbo.append(row_dict)
for _, row in deprecated_payout.iterrows():
    row_dict = row.to_dict()
    row_dict['_source'] = 'deprecated'
    all_vrbo.append(row_dict)

imported = 0
skipped = 0
errors = 0

for row_dict in all_vrbo:
    res_id = row_dict['Reservation ID']
    
    # Skip if already in Geeves
    if res_id in existing_confs:
        skipped += 1
        continue
    
    source = row_dict['_source']
    property_id, platform_id = get_geeves_mapping(pd.Series(row_dict), source)
    
    if not property_id:
        print(f"  ERROR: Can't map property for {res_id} (Property ID: {row_dict['Property ID']})")
        errors += 1
        continue
    
    # Parse dates
    try:
        checkin = datetime.strptime(row_dict['Check-in'], '%B %d, %Y')
        checkout = datetime.strptime(row_dict['Check-out'], '%B %d, %Y')
    except:
        print(f"  ERROR: Can't parse dates for {res_id}: {row_dict['Check-in']} - {row_dict['Check-out']}")
        errors += 1
        continue
    
    checkin_ms = int(checkin.timestamp() * 1000)
    checkout_ms = int(checkout.timestamp() * 1000)
    
    gross = float(row_dict['Gross booking amount'])
    payout = float(row_dict['Payout'])
    nights = int(row_dict['Nights'])
    guest_name = f"{row_dict['Traveler First Name']} {row_dict['Traveler Last Name']}"
    status = 'confirmed' if row_dict['Booking status'] == 'Reserve' else 'cancelled'
    
    # Handle refunds (negative amounts)
    if payout < 0:
        status = 'cancelled'
    
    booking_id = str(uuid.uuid4())
    
    cursor.execute("""
        INSERT INTO property_bookings 
        (id, propertyId, platformId, guestName, checkIn, checkOut, 
         totalPrice, netAmount, confirmationNumber, bookingStatus, createdAt, updatedAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
    """, (booking_id, property_id, platform_id, guest_name, checkin_ms, checkout_ms,
          gross, payout, res_id, status))
    
    imported += 1

conn.commit()

print(f"\n{'='*80}")
print(f"IMPORT RESULTS:")
print(f"  Imported: {imported}")
print(f"  Skipped (already exists): {skipped}")
print(f"  Errors: {errors}")

# Now verify final state
cursor.execute("""
    SELECT 
        p.name as property,
        pp.platform,
        COUNT(*) as cnt,
        SUM(CASE WHEN pb.bookingStatus = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN pb.bookingStatus = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN pb.bookingStatus = 'confirmed' THEN COALESCE(pb.totalPrice,0) ELSE 0 END) as gross,
        SUM(CASE WHEN pb.bookingStatus = 'confirmed' THEN COALESCE(pb.netAmount,0) ELSE 0 END) as net
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    GROUP BY p.name, pp.platform
    ORDER BY p.name, pp.platform
""")

print(f"\n{'='*80}")
print("UPDATED 2024 GEEVES STATE:")
print(f"{'='*80}")
print(f"{'Property':<30} | {'Platform':<12} | {'Conf':>4} | {'Canc':>4} | {'Gross':>12} | {'Net':>12}")
print("-"*90)
total_g = 0
total_n = 0
total_conf = 0
for row in cursor.fetchall():
    g = float(row['gross'])
    n = float(row['net'])
    total_g += g
    total_n += n
    total_conf += int(row['confirmed'])
    print(f"{row['property']:<30} | {row['platform']:<12} | {row['confirmed']:>4} | {row['cancelled']:>4} | ${g:>10,.2f} | ${n:>10,.2f}")
print("-"*90)
print(f"{'TOTAL':<30} | {'':>12} | {total_conf:>4} | {'':>4} | ${total_g:>10,.2f} | ${total_n:>10,.2f}")

conn.close()
