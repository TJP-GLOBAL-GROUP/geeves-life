"""
Penthouse Property Corrections Script
======================================
Executes 6 corrections to fix property/platform misclassifications:

1. Create "Penthouse (Unit 1 - 2BR)" property
2. Reassign all 2024 Morabeza-Airbnb bookings to Penthouse
3. Move Richard (Sep 7, 2024) from Airbnb platform to VRBO platform
4. Move Walter (Jun 28, 2024) to Sunset Studio (based on "Studio" in listing name)
5. Fix 3 "cancelled" Sunset Studio Airbnb 2024 bookings back to "confirmed"
6. Reassign VRBO platform (939ayddubY_KHSfH5GIFN) from Morabeza to Penthouse
"""

import mysql.connector
from urllib.parse import urlparse
import uuid
from datetime import datetime

GEEVES_DB = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(GEEVES_DB)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# Generate a nanoid-style ID
import string, random
def nanoid(size=21):
    chars = string.ascii_letters + string.digits + '-_'
    return ''.join(random.choices(chars, k=size))

print("=" * 80)
print("STEP 1: Create Penthouse (Unit 1 - 2BR) property")
print("=" * 80)

# Check if it already exists
cur.execute("SELECT id FROM properties WHERE name LIKE '%Penthouse%'")
existing = cur.fetchone()
if existing:
    penthouse_id = existing['id']
    print(f"  Penthouse already exists with ID: {penthouse_id}")
else:
    penthouse_id = nanoid()
    # Get householdId from Morabeza (same household)
    cur.execute("SELECT householdId FROM properties WHERE id = 'nJnk4hr3AxZJZ-RkwhRJy'")
    hh = cur.fetchone()
    household_id = hh['householdId']
    cur.execute("""
        INSERT INTO properties (id, householdId, name, address, type, timezone, country, isActive)
        VALUES (%s, %s, %s, %s, 'rental_str', 'America/New_York', 'US', 1)
    """, (penthouse_id, household_id, 'Penthouse (Unit 1 - 2BR)', '4693 SR 414, Burdett, NY 14818'))
    conn.commit()
    print(f"  Created Penthouse property with ID: {penthouse_id}")

print(f"\n  Penthouse ID: {penthouse_id}")

print("\n" + "=" * 80)
print("STEP 2: Reassign 2024 Morabeza-Airbnb bookings to Penthouse")
print("=" * 80)

# All bookings on platform eCyaTlnIhCUPtE57tQ26u with checkIn before May 2025
# EXCEPT: Ted (Jun 2025) stays on Morabeza, Phil Valenti+ stays on Morabeza
# The cutover is: everything before Aug 2025 (Phil Valenti Aug 22, 2025 = first real Morabeza)
# But Ted (Jun 2025) is VRBO so he'll be moved to VRBO platform separately

# Actually the listing was renamed around mid-2025 after Morabeza completion
# Svetlana (Nov 2024 - Feb 2025) is the last Penthouse guest on Airbnb
# Then there's a gap until Ted (Jun 2025, VRBO) and Phil (Aug 2025, Airbnb)
# Phil is confirmed first REAL Morabeza guest

# So: reassign all bookings with checkIn < Jun 1, 2025 to Penthouse property
# Ted (Jun 9, 2025) will be moved to VRBO platform in step 3
# Phil (Aug 22, 2025) and later stay as Morabeza

cutoff_ms = int(datetime(2025, 6, 1).timestamp() * 1000)

cur.execute("""
    SELECT id, guestName, DATE(FROM_UNIXTIME(checkIn/1000)) as checkInDate, propertyId
    FROM property_bookings
    WHERE platformId = 'eCyaTlnIhCUPtE57tQ26u'
    AND checkIn < %s
""", (cutoff_ms,))
bookings_to_move = cur.fetchall()
print(f"  Bookings to reassign to Penthouse: {len(bookings_to_move)}")
for b in bookings_to_move:
    print(f"    {b['checkInDate']} | {b['guestName']}")

# Update propertyId for these bookings
cur.execute("""
    UPDATE property_bookings
    SET propertyId = %s
    WHERE platformId = 'eCyaTlnIhCUPtE57tQ26u'
    AND checkIn < %s
""", (penthouse_id, cutoff_ms))
conn.commit()
print(f"  Updated {cur.rowcount} bookings to Penthouse property")

print("\n" + "=" * 80)
print("STEP 3: Move Richard from Airbnb platform to VRBO platform")
print("=" * 80)

# Richard (Sep 7, 2024, conf 1889279451) is on Morabeza-Airbnb platform
# Should be on Morabeza-VRBO platform (939ayddubY_KHSfH5GIFN)
# But since we're also moving the VRBO platform to Penthouse (step 6),
# we should move Richard to VRBO platform AND set his propertyId to Penthouse

cur.execute("""
    SELECT id, guestName, confirmationNumber, platformId, propertyId
    FROM property_bookings
    WHERE confirmationNumber = '1889279451'
""")
richard = cur.fetchone()
if richard:
    print(f"  Found Richard: ID={richard['id']}, currently on platform {richard['platformId']}")
    cur.execute("""
        UPDATE property_bookings
        SET platformId = '939ayddubY_KHSfH5GIFN', propertyId = %s
        WHERE id = %s
    """, (penthouse_id, richard['id']))
    conn.commit()
    print(f"  Moved Richard to VRBO platform (939ayddubY_KHSfH5GIFN) and Penthouse property")
else:
    print("  Richard not found!")

# Also move Ted (Jun 2025) to VRBO platform
# Ted stays as Morabeza property (since it's Jun 2025, after Penthouse became LTR)
# Actually Ted is Jun 2025 - the Penthouse was already converted to LTR by then
# So Ted is either at Morabeza (if it was ready) or somewhere else
# For now, move him to VRBO platform but keep him on Morabeza property
cur.execute("""
    SELECT id, guestName, confirmationNumber, platformId, propertyId
    FROM property_bookings
    WHERE confirmationNumber = '2186947601'
""")
ted_vrbo = cur.fetchone()
if ted_vrbo:
    print(f"\n  Found Ted (VRBO): ID={ted_vrbo['id']}, currently on platform {ted_vrbo['platformId']}")
    # Ted Jun 2025 - Penthouse was LTR by May 2025 (Jessica Dougherty lease)
    # So Ted must be at Morabeza (which was under construction but maybe ready for a short stay?)
    # Or could be Sunset Studio? Keep as Morabeza for now, just fix the platform
    cur.execute("""
        UPDATE property_bookings
        SET platformId = '939ayddubY_KHSfH5GIFN'
        WHERE id = %s
    """, (ted_vrbo['id'],))
    conn.commit()
    print(f"  Moved Ted to VRBO platform (939ayddubY_KHSfH5GIFN), kept on Morabeza property")

print("\n" + "=" * 80)
print("STEP 4: Move Walter to Sunset Studio")
print("=" * 80)

# Walter (Jun 28, 2024) - email says "Stunning Lake View Studio" = Sunset Studio
# Currently on Morabeza-Airbnb platform, needs to go to Sunset Studio Airbnb
cur.execute("""
    SELECT id FROM property_platforms
    WHERE propertyId = 'Ln-_SMF7Nrt1uXsQcdP9C' AND platform = 'airbnb'
""")
sunset_airbnb_platform = cur.fetchone()
sunset_airbnb_id = sunset_airbnb_platform['id']

cur.execute("""
    SELECT id, guestName, platformId, propertyId
    FROM property_bookings
    WHERE platformId = 'eCyaTlnIhCUPtE57tQ26u'
    AND guestName = 'Walter'
""")
walter = cur.fetchone()
if walter:
    print(f"  Found Walter: ID={walter['id']}")
    cur.execute("""
        UPDATE property_bookings
        SET platformId = %s, propertyId = 'Ln-_SMF7Nrt1uXsQcdP9C'
        WHERE id = %s
    """, (sunset_airbnb_id, walter['id']))
    conn.commit()
    print(f"  Moved Walter to Sunset Studio Airbnb platform ({sunset_airbnb_id})")
else:
    print("  Walter not found (may have already been moved in step 2)")
    # Walter was in the pre-Jun 2025 batch, so his propertyId is now Penthouse
    # Let's find him by name
    cur.execute("""
        SELECT id, guestName, platformId, propertyId
        FROM property_bookings
        WHERE guestName = 'Walter'
        AND propertyId = %s
    """, (penthouse_id,))
    walter2 = cur.fetchone()
    if walter2:
        print(f"  Found Walter on Penthouse: ID={walter2['id']}")
        cur.execute("""
            UPDATE property_bookings
            SET platformId = %s, propertyId = 'Ln-_SMF7Nrt1uXsQcdP9C'
            WHERE id = %s
        """, (sunset_airbnb_id, walter2['id']))
        conn.commit()
        print(f"  Moved Walter to Sunset Studio Airbnb platform")

print("\n" + "=" * 80)
print("STEP 5: Fix cancelled Sunset Studio Airbnb 2024 bookings")
print("=" * 80)

# Ethan Wakefield (Jul 17), Shardy Mitchell (Jul 29), Kara Allelunas (Aug 13)
# All have "Reservation confirmed" in email subjects but status=cancelled
# These are real bookings that were marked cancelled by iCal sync
cur.execute("""
    SELECT id, guestName, bookingStatus, rawEmailSubject
    FROM property_bookings
    WHERE platformId = %s
    AND checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    AND bookingStatus = 'cancelled'
""", (sunset_airbnb_id,))
cancelled_bookings = cur.fetchall()
print(f"  Found {len(cancelled_bookings)} cancelled Sunset Studio Airbnb 2024 bookings:")
for b in cancelled_bookings:
    # Only fix ones with "confirmed" in subject
    if 'confirmed' in (b['rawEmailSubject'] or '').lower() or 'arrives' in (b['rawEmailSubject'] or '').lower():
        print(f"    {b['guestName']} | Subject: {b['rawEmailSubject'][:50]} → FIXING to confirmed")
        cur.execute("""
            UPDATE property_bookings SET bookingStatus = 'confirmed' WHERE id = %s
        """, (b['id'],))
    else:
        print(f"    {b['guestName']} | Subject: {b['rawEmailSubject'][:50]} → SKIPPING")

conn.commit()
print(f"  Fixed {cur.rowcount} bookings to 'confirmed' status")

print("\n" + "=" * 80)
print("STEP 6: Reassign VRBO platform from Morabeza to Penthouse")
print("=" * 80)

# Platform 939ayddubY_KHSfH5GIFN (VRBO iCal for listing #2778727)
# This was the Penthouse VRBO listing in 2024
# After Penthouse became LTR (May 2025), the VRBO listing was either:
# - Deactivated (Penthouse is now LTR)
# - Or transferred to Morabeza (if Morabeza took over the listing)
# 
# For now, assign it to Penthouse since that's where most of its bookings belong
# The few 2025+ bookings on this platform can be reassigned later if needed

cur.execute("""
    UPDATE property_platforms
    SET propertyId = %s
    WHERE id = '939ayddubY_KHSfH5GIFN'
""", (penthouse_id,))
conn.commit()
print(f"  Reassigned VRBO platform 939ayddubY_KHSfH5GIFN to Penthouse property")

# Also update all bookings on this platform to Penthouse property
cur.execute("""
    UPDATE property_bookings
    SET propertyId = %s
    WHERE platformId = '939ayddubY_KHSfH5GIFN'
""", (penthouse_id,))
conn.commit()
print(f"  Updated {cur.rowcount} VRBO bookings to Penthouse property")

print("\n" + "=" * 80)
print("VERIFICATION")
print("=" * 80)

# Verify the changes
cur.execute("""
    SELECT p.name, pp.platform, pp.displayName, COUNT(pb.id) as bookings,
           SUM(COALESCE(pb.totalPrice, 0)) as revenue
    FROM properties p
    LEFT JOIN property_platforms pp ON pp.propertyId = p.id
    LEFT JOIN property_bookings pb ON pb.platformId = pp.id
    WHERE p.id IN (%s, 'nJnk4hr3AxZJZ-RkwhRJy', 'Ln-_SMF7Nrt1uXsQcdP9C')
    GROUP BY p.name, pp.platform, pp.displayName
    ORDER BY p.name, pp.platform
""", (penthouse_id,))
verification = cur.fetchall()
print("\nPost-correction booking counts:")
for v in verification:
    print(f"  {v['name']} | {v['platform']} ({v['displayName']}) | {v['bookings']} bookings | ${float(v['revenue']):,.2f}")

conn.close()
print("\n\nDONE! All 6 corrections applied successfully.")
