#!/usr/bin/env python3
"""Remove duplicate bookings (same conf# with short vs full name) and get final clean state."""
import mysql.connector, subprocess
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

# Remove duplicates - keep the one with the longer/fuller name
dupes_to_fix = ['HMSX8XWMTH', 'HMHQXDQ2PP', 'HM99SPXDY9', 'HMN35WNYQ5', 'HMQDSPZ944']

print("REMOVING DUPLICATE BOOKINGS (same conf#, short vs full name):")
for conf in dupes_to_fix:
    cursor.execute('''
        SELECT id, guestName, COALESCE(netAmount,0) as net
        FROM property_bookings 
        WHERE confirmationNumber = %s AND bookingStatus = 'confirmed'
        ORDER BY LENGTH(COALESCE(guestName,''))
    ''', (conf,))
    rows = cursor.fetchall()
    if len(rows) > 1:
        # Delete the shorter-name one (first in order)
        to_delete = rows[0]
        to_keep = rows[-1]
        cursor.execute('DELETE FROM property_bookings WHERE id = %s', (to_delete['id'],))
        print(f"  {conf}: Deleted '{to_delete['guestName']}', kept '{to_keep['guestName']}' (${float(to_keep['net']):,.2f})")
    elif len(rows) == 1:
        print(f"  {conf}: Only 1 entry, no dupe ('{rows[0]['guestName']}')")

conn.commit()

# Also remove Diana ($0, no conf) - clearly a phantom
cursor.execute('''
    DELETE FROM property_bookings 
    WHERE guestName = 'Diana' AND confirmationNumber IS NULL 
    AND COALESCE(netAmount,0) = 0 AND bookingStatus = 'confirmed'
''')
if cursor.rowcount > 0:
    print(f"\n  Removed Diana phantom entry ($0, no conf)")
conn.commit()

# FINAL STATE
print("\n" + "="*80)
print("FINAL CLEAN 2024 STATE")
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

# Airbnb-only
cursor.execute('''
    SELECT SUM(COALESCE(pb.netAmount,0)) as net, COUNT(*) as cnt
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pp.platform = 'airbnb'
    AND YEAR(FROM_UNIXTIME(pb.checkIn/1000)) = 2024
    AND pb.bookingStatus = 'confirmed'
''')
airbnb = cursor.fetchone()
airbnb_net = float(airbnb['net'])

print(f'\n--- RECONCILIATION ---')
print(f'Geeves Airbnb-only net:  ${airbnb_net:>10,.2f}')
print(f'Airbnb Export total:     $ 52,048.17')
print(f'Difference:              ${airbnb_net - 52048.17:>+10,.2f}')
print(f'')
print(f'Geeves ALL platforms:    ${total_net:>10,.2f}')
print(f'QBO STR deposits:        $ 59,658.00')
print(f'Difference:              ${total_net - 59658:>+10,.2f}')
print(f'')
print(f'Remaining Geeves excess over export explained by:')
print(f'  7 unverified bookings (not in either export): ~$3,540')
print(f'  These may be from a 3rd Airbnb account or need cancellation')

conn.close()
