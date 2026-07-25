import mysql.connector
from urllib.parse import urlparse

GEEVES_DB = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(GEEVES_DB)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False,
                               consume_results=True)
cur = conn.cursor(dictionary=True)

# Get all Artiste's 2024 bookings
cur.execute("""
    SELECT pb.id, pb.guestName, pb.confirmationNumber, 
           DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate,
           pb.totalPrice, pb.rawEmailSubject
    FROM property_bookings pb
    WHERE pb.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    AND pb.bookingStatus != 'cancelled'
    ORDER BY pb.checkIn
""")
artiste_bookings = cur.fetchall()

# Get all Penthouse 2024 bookings for comparison
cur.execute("""
    SELECT pb.id, pb.guestName, pb.confirmationNumber,
           DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate
    FROM property_bookings pb
    WHERE pb.propertyId = 'YiyTtDDIqXx88hD9ZWCo7'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
""")
penthouse_bookings = cur.fetchall()
penthouse_confs = {b['confirmationNumber'] for b in penthouse_bookings if b['confirmationNumber']}

print("Artiste's Boutique 2024 bookings analysis:")
print("=" * 100)

dupes_to_delete = []
for ab in artiste_bookings:
    conf = ab['confirmationNumber']
    subj = (ab['rawEmailSubject'] or "")[:70]
    price = f"${float(ab['totalPrice'] or 0):,.2f}"
    
    if conf and conf in penthouse_confs:
        dupes_to_delete.append(ab['id'])
        print(f"  DUPE (same conf on Penthouse): {ab['guestName']:<20} | {ab['checkInDate']} | {price} | conf={conf}")
    else:
        # Check if subject mentions Penthouse/Lake View
        is_penthouse_subj = any(x in subj for x in ['Penthouse', 'Lakeside 2 Bedroom', 'Lake View'])
        marker = " ← PENTHOUSE LISTING" if is_penthouse_subj else ""
        print(f"  KEEP: {ab['guestName']:<20} | {ab['checkInDate']} | {price} | conf={conf or 'None'}{marker}")
        print(f"        Subject: {subj}")

print(f"\n\nDuplicates to delete: {len(dupes_to_delete)}")
if dupes_to_delete:
    placeholders = ','.join(['%s'] * len(dupes_to_delete))
    cur.execute(f"DELETE FROM property_bookings WHERE id IN ({placeholders})", dupes_to_delete)
    conn.commit()
    print(f"Deleted {len(dupes_to_delete)} duplicates")

# Final picture
print("\n" + "=" * 80)
print("FINAL 2024 PICTURE")
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
print(f"  QBO 2024 STR Income: ~$59,658")
print(f"  REMAINING GAP: ${59658 - total_net:,.2f}")

# Breakdown of remaining gap
print(f"\n  GAP BREAKDOWN:")
print(f"    Airbnb: QBO $42,402 vs Geeves ${total_net - 5079 - 2519:.0f} (Airbnb only) = gap ~${42402 - (total_net - 5079 - 2519):.0f}")
print(f"    VRBO: QBO $11,576 vs Geeves ${5079 + 2519:.0f} = gap ~${11576 - 5079 - 2519:.0f}")
print(f"    Booking.com: QBO $4,042 vs Geeves $0 = gap $4,042")
print(f"    PayPal: QBO $1,638 vs Geeves $0 = gap $1,638")

conn.close()
