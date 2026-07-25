import mysql.connector
from urllib.parse import urlparse

GEEVES_DB = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
parsed = urlparse(GEEVES_DB)
conn = mysql.connector.connect(host=parsed.hostname, port=parsed.port or 3306,
                               user=parsed.username, password=parsed.password,
                               database=parsed.path.lstrip('/'), ssl_disabled=False,
                               consume_results=True)
cur = conn.cursor(dictionary=True)

# Check new bookings created by the tarikp@gmail.com scrape
print("=" * 80)
print("NEW BOOKINGS FROM tarikp@gmail.com SCRAPE")
print("=" * 80)

# Penthouse VRBO - 7 new bookings
print("\n--- Penthouse VRBO (7 new from tarikp@gmail.com) ---")
cur.execute("""
    SELECT pb.guestName, DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate,
           pb.totalPrice, pb.netAmount, pb.confirmationNumber
    FROM property_bookings pb
    WHERE pb.propertyId = 'YiyTtDDIqXx88hD9ZWCo7'
    AND pb.platformId = '939ayddubY_KHSfH5GIFN'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    ORDER BY pb.checkIn
""")
ph_vrbo = cur.fetchall()
total_net = 0
for b in ph_vrbo:
    net = float(b['netAmount'] or 0)
    total_net += net
    print(f"  {b['checkInDate']} | {b['guestName']:<25} | Net: ${net:>8,.2f} | Conf: {b['confirmationNumber'] or 'None'}")
print(f"  TOTAL: {len(ph_vrbo)} bookings, Net: ${total_net:,.2f}")

# Artiste's Airbnb - 2 new bookings
print("\n--- Artiste's Airbnb (2 new from tarikp@gmail.com) ---")
cur.execute("""
    SELECT pb.guestName, DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate,
           pb.totalPrice, pb.netAmount, pb.confirmationNumber, pb.rawEmailSubject
    FROM property_bookings pb
    WHERE pb.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
    AND pb.platformId = 'RiVJhUt8EySJ7Lu3q4zxm'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    ORDER BY pb.checkIn
""")
art_airbnb = cur.fetchall()
total_net_art = 0
for b in art_airbnb:
    net = float(b['netAmount'] or 0)
    total_net_art += net
    subj = (b['rawEmailSubject'] or "")[:50]
    print(f"  {b['checkInDate']} | {b['guestName']:<25} | Net: ${net:>8,.2f} | {subj}")
print(f"  TOTAL: {len(art_airbnb)} bookings, Net: ${total_net_art:,.2f}")

# Artiste's Booking.com - 1 new booking
print("\n--- Artiste's Booking.com (1 new from tarikp@gmail.com) ---")
cur.execute("""
    SELECT pb.guestName, DATE(FROM_UNIXTIME(pb.checkIn/1000)) as checkInDate,
           pb.totalPrice, pb.netAmount, pb.confirmationNumber
    FROM property_bookings pb
    WHERE pb.propertyId = 'ZI2Zy7OuLGYF-vmWOAII-'
    AND pb.platformId = 'WdEb2m0TeRdjmNPpKKqMB'
    AND pb.checkIn >= UNIX_TIMESTAMP('2024-01-01') * 1000
    AND pb.checkIn < UNIX_TIMESTAMP('2025-01-01') * 1000
    ORDER BY pb.checkIn
""")
art_bcom = cur.fetchall()
for b in art_bcom:
    net = float(b['netAmount'] or 0)
    print(f"  {b['checkInDate']} | {b['guestName']:<25} | Net: ${net:>8,.2f} | Conf: {b['confirmationNumber'] or 'None'}")

# Full updated picture
print("\n\n" + "=" * 80)
print("UPDATED 2024 FULL PICTURE")
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

# Now revert the platform emails back to tarik@maxfieldmarket.com
print("\n\n" + "=" * 80)
print("REVERTING PLATFORM EMAILS")
print("=" * 80)

# Penthouse VRBO back to tarik@maxfieldmarket.com
cur.execute("""
    UPDATE property_platforms 
    SET notificationEmail = 'tarik@maxfieldmarket.com'
    WHERE id = '939ayddubY_KHSfH5GIFN'
""")
print(f"  Penthouse VRBO → tarik@maxfieldmarket.com: {cur.rowcount}")

# Artiste's Booking.com back to tarik@maxfieldmarket.com
cur.execute("""
    UPDATE property_platforms 
    SET notificationEmail = 'tarik@maxfieldmarket.com'
    WHERE id = 'WdEb2m0TeRdjmNPpKKqMB'
""")
print(f"  Artiste's Booking.com → tarik@maxfieldmarket.com: {cur.rowcount}")

# Artiste's Airbnb back to tarik@maxfieldmarket.com
cur.execute("""
    UPDATE property_platforms 
    SET notificationEmail = 'tarik@maxfieldmarket.com'
    WHERE id = 'RiVJhUt8EySJ7Lu3q4zxm'
""")
print(f"  Artiste's Airbnb → tarik@maxfieldmarket.com: {cur.rowcount}")

conn.commit()
print("  All reverted!")

conn.close()
