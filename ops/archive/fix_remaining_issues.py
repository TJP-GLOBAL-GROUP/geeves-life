#!/usr/bin/env python3
"""Fix remaining issues: Morabeza->Penthouse, year-shifted dupes, and get final state."""
import mysql.connector, subprocess, uuid
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

# Check property_platforms schema
cursor.execute('DESCRIBE property_platforms')
pp_cols = [c['Field'] for c in cursor.fetchall()]
print(f"property_platforms columns: {pp_cols}")

# Create Penthouse Airbnb platform with all required fields
new_id = str(uuid.uuid4())[:21]
print(f"\nCreating Penthouse Airbnb platform (id: {new_id})")
cursor.execute('''
    INSERT INTO property_platforms (id, propertyId, platform, displayName, 
        notificationEmail, emailScrapingEnabled, icalUrl, createdAt)
    VALUES (%s, 'YiyTtDDIqXx88hD9ZWCo7', 'airbnb', 'Penthouse - Airbnb', 
        'tarik@maxfieldmarket.com', 1, '', NOW())
''', (new_id,))
conn.commit()
print("  Created successfully")

# Move all Morabeza Airbnb 2024 bookings to Penthouse
cursor.execute('''
    SELECT pb.id, pb.guestName, pb.confirmationNumber
    FROM property_bookings pb
    WHERE pb.platformId = 'eCyaTlnIhCUPtE57tQ26u'
    AND YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
''')
morabeza_bookings = cursor.fetchall()
print(f"\nMoving {len(morabeza_bookings)} Morabeza Airbnb 2024 bookings to Penthouse")
for b in morabeza_bookings:
    cursor.execute('''
        UPDATE property_bookings 
        SET platformId = %s, propertyId = 'YiyTtDDIqXx88hD9ZWCo7'
        WHERE id = %s
    ''', (new_id, b['id']))
conn.commit()
print("  Done")

# Remove year-shifted duplicates
print("\nRemoving year-shifted duplicates:")
year_dupes = ['HMTXP28WDJ', 'HM98SWEK99', 'HM8YXH2BMC']
for conf in year_dupes:
    cursor.execute('''
        SELECT id, guestName, FROM_UNIXTIME(checkIn/1000) as checkIn
        FROM property_bookings 
        WHERE confirmationNumber = %s
        ORDER BY checkIn
    ''', (conf,))
    rows = cursor.fetchall()
    if len(rows) > 1:
        for r in rows:
            ci = str(r['checkIn'])
            if '2025' in ci or '2026' in ci:
                cursor.execute('DELETE FROM property_bookings WHERE id = %s', (r['id'],))
                print(f'  Deleted: {r["guestName"]} ({ci}) - {conf}')
    else:
        print(f'  {conf}: only 1 entry, no dupe to remove')
conn.commit()

# Get FINAL state
print("\n" + "="*80)
print("FINAL 2024 STATE (confirmed bookings only)")
print("="*80)
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
print(f'QBO 2024 STR Total (bank deposits): $59,658')
print(f'Geeves exceeds Airbnb export by: ${total_net - 52048.17:,.2f}')
print(f'Geeves exceeds QBO by: ${total_net - 59658:,.2f}')

# The excess is from:
# 1. Extra bookings in Geeves not in export (Ken Grieve, Ludo, Ethan, Shardy, Jordan Petroff, Seth, Anat, Kara, Leo, Alyssa, Tarik)
# 2. VRBO and Booking.com bookings (not in Airbnb export)
# Let's separate Airbnb-only
cursor.execute('''
    SELECT 
        p.name as property,
        SUM(COALESCE(pb.netAmount,0)) as net,
        COUNT(*) as cnt
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    AND pb.bookingStatus = 'confirmed'
    AND pp.platform = 'airbnb'
    GROUP BY p.name
    ORDER BY p.name
''')
print(f'\nAIRBNB-ONLY 2024:')
airbnb_total = 0
for row in cursor.fetchall():
    n = float(row['net'])
    airbnb_total += n
    print(f'  {row["property"]:<30} | {row["cnt"]:>3} bookings | ${n:>10,.2f}')
print(f'  {"TOTAL":<30} |     | ${airbnb_total:>10,.2f}')
print(f'  Airbnb Export says:                        ${52048.17:>10,.2f}')
print(f'  Geeves Airbnb excess:                      ${airbnb_total - 52048.17:>10,.2f}')

conn.close()
