import mysql.connector
from urllib.parse import urlparse

GEEVES_DB = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(GEEVES_DB)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False,
                               consume_results=True)
cur = conn.cursor(dictionary=True)

# === STEP 1: Remove Artiste's bookings that are clearly Penthouse duplicates ===
# These have subjects mentioning Penthouse guests but are assigned to Artiste's

# Swagatika (May 24) - subject "Yi-Ru Pei arrives May 26" - Yi-Ru already on Penthouse
# Heather Kranick (Jun 20) - subject "Christopher Fleury arrives" - Christopher already on Penthouse
# Glenn (Oct 3) - subject "Abby Allen arrives Oct 3" - Abby Allen already on Penthouse
# Sarah (Oct 18) - subject "Sherry is coming soon!" - Sherry already on Penthouse

artiste_dupes_to_delete = []
for guest, date in [('Swagatika', '2024-05-24'), ('Heather Kranick', '2024-06-20'), 
                     ('Glenn', '2024-10-03'), ('Sarah', '2024-10-18')]:
    cur.execute("""
        SELECT id FROM property_bookings
        WHERE guestName = %s AND propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
        AND DATE(FROM_UNIXTIME(checkIn/1000)) = %s
    """, (guest, date))
    r = cur.fetchone()
    if r:
        artiste_dupes_to_delete.append(r['id'])
        print(f"  Will delete Artiste's dupe: {guest} ({date})")

if artiste_dupes_to_delete:
    placeholders = ','.join(['%s'] * len(artiste_dupes_to_delete))
    cur.execute(f"DELETE FROM property_bookings WHERE id IN ({placeholders})", artiste_dupes_to_delete)
    print(f"  Deleted {cur.rowcount} Artiste's duplicates")

# === STEP 2: Remove Christopher Fleury duplicate on Penthouse (2 entries) ===
# Keep the one with full name "Christopher Fleury", delete "Christopher"
cur.execute("""
    SELECT id, guestName FROM property_bookings
    WHERE propertyId = 'YiyTtDDIqXx88hD9ZWCo7'
    AND DATE(FROM_UNIXTIME(checkIn/1000)) = '2024-06-21'
    AND guestName LIKE '%Christopher%'
""")
chris_entries = cur.fetchall()
if len(chris_entries) > 1:
    for c in chris_entries:
        if c['guestName'] == 'Christopher':
            cur.execute("DELETE FROM property_bookings WHERE id = %s", (c['id'],))
            print(f"  Deleted 'Christopher' duplicate (keeping 'Christopher Fleury')")

# === STEP 3: Remove Sean duplicate on Penthouse ===
cur.execute("""
    SELECT id, confirmationNumber FROM property_bookings
    WHERE guestName = 'Sean' AND propertyId = 'YiyTtDDIqXx88hD9ZWCo7'
    AND DATE(FROM_UNIXTIME(checkIn/1000)) = '2024-04-07'
""")
seans = cur.fetchall()
if len(seans) > 1:
    # Keep the one with confirmation number
    for s in seans:
        if not s['confirmationNumber']:
            cur.execute("DELETE FROM property_bookings WHERE id = %s", (s['id'],))
            print(f"  Deleted Sean duplicate without conf number")

# === STEP 4: Handle VRBO cross-property duplicates ===
# These are VRBO bookings that exist on both Penthouse and Sunset Studio
# Kailen Winkelblech (Jul 8) - $256 for 2 nights = $128/night → Sunset Studio pricing
# Emily Mourgides (Jul 18) - $256 for 2 nights = $128/night → Sunset Studio pricing
# Christina Dilworth (Aug 15) - on both?
# Kimberly Joseph (Aug 23) - on both?
# Constance Robinson (Aug 26) - on both?
# Joseph DiLauro (Sep 20) - on both?
# Tarik Perkins (Sep 27) - on both?

vrbo_dupes = [
    ('Kailen Winkelblech', '2024-07-08'),
    ('Emily Mourgides', '2024-07-18'),
    ('Christina Dilworth', '2024-08-15'),
    ('Kimberly Joseph', '2024-08-23'),
    ('Constance Robinson', '2024-08-26'),
    ('Joseph DiLauro', '2024-09-20'),
    ('Tarik Perkins', '2024-09-27'),
]

print(f"\n  VRBO cross-property duplicates:")
for guest, date in vrbo_dupes:
    cur.execute("""
        SELECT pb.id, p.name, pb.totalPrice, pb.netAmount, pb.confirmationNumber
        FROM property_bookings pb
        JOIN properties p ON p.id = pb.propertyId
        WHERE pb.guestName = %s
        AND DATE(FROM_UNIXTIME(pb.checkIn/1000)) = %s
    """, (guest, date))
    entries = cur.fetchall()
    if len(entries) > 1:
        # Keep the one with the most data (net amount > 0)
        keep = None
        delete = []
        for e in entries:
            if float(e['netAmount'] or 0) > 0:
                keep = e
            else:
                delete.append(e)
        if not keep:
            # Both have $0 - keep the Sunset Studio one (cheaper listing)
            keep = entries[0]
            delete = entries[1:]
        
        for d in delete:
            cur.execute("DELETE FROM property_bookings WHERE id = %s", (d['id'],))
            print(f"    {guest} ({date}): deleted from {d['name']} (kept on {keep['name']})")
    elif len(entries) == 1:
        print(f"    {guest} ({date}): only 1 entry, no dupe")

conn.commit()

# === FINAL PICTURE ===
print("\n\n" + "=" * 80)
print("FINAL 2024 PICTURE AFTER ALL CLEANUP")
print("=" * 80)
cur.execute("""
    SELECT p.name, pp.platform, 
           COUNT(pb.id) as bookings,
           SUM(COALESCE(pb.netAmount, 0)) as net_revenue,
           SUM(COALESCE(pb.totalPrice, 0)) as gross_revenue
    FROM property_bookings pb
    JOIN property_platforms pp ON pp.id = pb.platformId
    JOIN properties p ON p.id = pb.propertyId
    WHERE pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    AND pb.bookingStatus != 'cancelled'
    GROUP BY p.name, pp.platform
    ORDER BY p.name, pp.platform
""")
full_2024 = cur.fetchall()
total_net = 0
total_gross = 0
for b in full_2024:
    net = float(b['net_revenue'])
    gross = float(b['gross_revenue'])
    total_net += net
    total_gross += gross
    print(f"  {b['name']:<30} | {b['platform']:<12} | {b['bookings']:>3} bookings | Gross: ${gross:>10,.2f} | Net: ${net:>10,.2f}")
print(f"\n  TOTAL 2024 GROSS (Geeves): ${total_gross:,.2f}")
print(f"  TOTAL 2024 NET (Geeves): ${total_net:,.2f}")

# QBO breakdown for comparison
print(f"\n  QBO 2024 STR Income breakdown:")
print(f"    Airbnb: $42,402")
print(f"    VRBO: $11,576 (net of refunds)")
print(f"    Booking.com H2: $4,042 (H1 $7,591 may be 2023 payout)")
print(f"    PayPal: $1,638")
print(f"    TOTAL (excl H1 Booking.com): $59,658")
print(f"\n  REMAINING GAP: ${59658 - total_net:,.2f}")

# Check remaining duplicates
cur.execute("""
    SELECT guestName, DATE(FROM_UNIXTIME(checkIn/1000)) as checkInDate, COUNT(*) as cnt
    FROM property_bookings
    WHERE checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    AND bookingStatus != 'cancelled'
    GROUP BY guestName, DATE(FROM_UNIXTIME(checkIn/1000))
    HAVING cnt > 1
""")
dupes = cur.fetchall()
print(f"\n  Remaining duplicates: {len(dupes)}")
for d in dupes:
    print(f"    {d['checkInDate']} | {d['guestName']} | {d['cnt']}")

conn.close()
