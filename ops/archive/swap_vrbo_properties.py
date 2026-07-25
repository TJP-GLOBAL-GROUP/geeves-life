"""
Swap VRBO property assignments between Penthouse and Studio.

Based on nightly rate analysis:
- VRBO 3889059 (414, $178/night) → currently "Sunset Studio" → should be PENTHOUSE
- VRBO 3890454 (414 2, $103/night) → currently "Penthouse" → should be SUNSET STUDIO
- VRBO 4698060 (414 4, $220/night) → new listing → PENTHOUSE
- VRBO 4728879 (414 3, $120/night) → new listing → SUNSET STUDIO
"""

import mysql.connector, subprocess
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

# Get property IDs
cursor.execute("SELECT id, name FROM properties")
properties = {r['name']: r['id'] for r in cursor.fetchall()}
penthouse_id = properties['Penthouse (Unit 1 - 2BR)']
studio_id = properties['Sunset Studio']

print(f"Penthouse ID: {penthouse_id}")
print(f"Studio ID: {studio_id}")

# Get VRBO platforms
cursor.execute("""
    SELECT pp.id, pp.propertyId, p.name as property_name
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.platform = 'vrbo'
""")
vrbo_platforms = cursor.fetchall()
print(f"\nVRBO platforms before swap:")
for vp in vrbo_platforms:
    cursor.execute("SELECT COUNT(*) as cnt FROM property_bookings WHERE platformId = %s", (vp['id'],))
    cnt = cursor.fetchone()['cnt']
    print(f"  {vp['id']} → {vp['property_name']} ({cnt} bookings)")

# Find the two VRBO platforms that need swapping
# The one currently on Studio (should be Penthouse)
studio_vrbo_platform = None
# The one currently on Penthouse (should be Studio)
penthouse_vrbo_platform = None

for vp in vrbo_platforms:
    if vp['propertyId'] == studio_id:
        studio_vrbo_platform = vp['id']  # This is actually Penthouse bookings
    elif vp['propertyId'] == penthouse_id:
        penthouse_vrbo_platform = vp['id']  # This is actually Studio bookings

print(f"\nPlatform currently on Studio (has Penthouse bookings): {studio_vrbo_platform}")
print(f"Platform currently on Penthouse (has Studio bookings): {penthouse_vrbo_platform}")

# SWAP Step 1: Update the platform propertyId assignments
if studio_vrbo_platform and penthouse_vrbo_platform:
    # Swap platform → property assignments
    cursor.execute("""
        UPDATE property_platforms SET propertyId = %s WHERE id = %s
    """, (penthouse_id, studio_vrbo_platform))
    print(f"\nSwapped platform {studio_vrbo_platform} from Studio → Penthouse")
    
    cursor.execute("""
        UPDATE property_platforms SET propertyId = %s WHERE id = %s
    """, (studio_id, penthouse_vrbo_platform))
    print(f"Swapped platform {penthouse_vrbo_platform} from Penthouse → Studio")
    
    # SWAP Step 2: Update all bookings on these platforms to the correct property
    cursor.execute("""
        UPDATE property_bookings SET propertyId = %s WHERE platformId = %s
    """, (penthouse_id, studio_vrbo_platform))
    affected1 = cursor.rowcount
    print(f"Reassigned {affected1} bookings to Penthouse")
    
    cursor.execute("""
        UPDATE property_bookings SET propertyId = %s WHERE platformId = %s
    """, (studio_id, penthouse_vrbo_platform))
    affected2 = cursor.rowcount
    print(f"Reassigned {affected2} bookings to Studio")

conn.commit()

# Verify the swap
print(f"\n{'='*60}")
print("VRBO platforms AFTER swap:")
cursor.execute("""
    SELECT pp.id, pp.propertyId, p.name as property_name
    FROM property_platforms pp
    JOIN properties p ON pp.propertyId = p.id
    WHERE pp.platform = 'vrbo'
""")
vrbo_platforms_after = cursor.fetchall()
for vp in vrbo_platforms_after:
    cursor.execute("SELECT COUNT(*) as cnt FROM property_bookings WHERE platformId = %s", (vp['id'],))
    cnt = cursor.fetchone()['cnt']
    print(f"  {vp['id']} → {vp['property_name']} ({cnt} bookings)")

# Now handle the new listings (4698060 and 4728879)
# These bookings were imported earlier and assigned based on the old (wrong) mapping
# We need to check which platform they ended up on and fix if needed
# 
# From the VRBO export:
# 4698060 bookings: Jean Van Eten, Lauren Crawford, Coral Ramsey, Bill Wright, Xing Li
# 4728879 bookings: Chris Dolan, Jacob Depinet, Angela Moyer, Kate Landis, etc.
#
# These should be:
# 4698060 → Penthouse (high rate $220/night)
# 4728879 → Studio (lower rate $120/night)

# Check where these guests ended up
print(f"\n\n{'='*60}")
print("CHECKING NEW LISTING BOOKINGS:")
new_penthouse_guests = ['Jean Van Eten', 'Lauren Crawford', 'Coral Ramsey', 'Bill Wright', 'Xing Li']
new_studio_guests = ['Chris Dolan', 'Jacob Depinet', 'Angela Moyer', 'Kate Landis', 'Alice Mako', 
                     'Jennifer Loewenstein', 'Raine Korpics', 'Jenny Benjamin-Rider']

for guest in new_penthouse_guests[:3]:
    cursor.execute("""
        SELECT pb.guestName, p.name as property_name 
        FROM property_bookings pb 
        JOIN properties p ON pb.propertyId = p.id
        WHERE pb.guestName LIKE %s
    """, (f"%{guest.split()[0]}%",))
    results = cursor.fetchall()
    for r in results:
        correct = "✓" if r['property_name'] == 'Penthouse (Unit 1 - 2BR)' else "✗ NEEDS FIX"
        print(f"  {r['guestName']:<25} → {r['property_name']} {correct}")

for guest in new_studio_guests[:3]:
    cursor.execute("""
        SELECT pb.guestName, p.name as property_name 
        FROM property_bookings pb 
        JOIN properties p ON pb.propertyId = p.id
        WHERE pb.guestName LIKE %s
    """, (f"%{guest.split()[0]}%",))
    results = cursor.fetchall()
    for r in results:
        correct = "✓" if r['property_name'] == 'Sunset Studio' else "✗ NEEDS FIX"
        print(f"  {r['guestName']:<25} → {r['property_name']} {correct}")

# Final 2024 state
print(f"\n\n{'='*60}")
print("FINAL 2024 STATE (confirmed only):")
print("="*60)
cursor.execute("""
    SELECT 
        p.name as property,
        pp.platform,
        COUNT(*) as count,
        SUM(COALESCE(pb.totalPrice,0)) as gross,
        SUM(COALESCE(pb.netAmount,0)) as net
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pb.checkIn >= 1704067200000
    AND pb.checkIn < 1735689600000
    AND pb.bookingStatus = 'confirmed'
    GROUP BY p.name, pp.platform
    ORDER BY p.name, pp.platform
""")
rows = cursor.fetchall()
total_gross = 0
total_net = 0
for row in rows:
    g = float(row['gross'])
    n = float(row['net'])
    total_gross += g
    total_net += n
    print(f"  {row['property']:<30} | {row['platform']:<12} | {row['count']:>3} | Gross: ${g:>10,.2f} | Net: ${n:>10,.2f}")
print(f"  {'TOTAL':<30} | {'':12} | {'':>3} | Gross: ${total_gross:>10,.2f} | Net: ${total_net:>10,.2f}")

conn.close()
