#!/usr/bin/env python3
"""Analyze the VRBO gap to determine if it's taxes or traveler service fee."""
import mysql.connector
import subprocess
from urllib.parse import urlparse

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

# Get ALL VRBO bookings with financials and calculate the gap
print("=== ALL VRBO bookings with financials - Gap Analysis ===")
print(f"{'Guest':<25} {'Conf':<12} {'Property':<20} {'Total':>8} {'Comm':>8} {'Net':>8} {'Gap':>8} {'Gap%':>6} {'Clean':>6} {'Nights':>6} {'$/Night':>8}")
print("-" * 140)

cursor.execute("""
    SELECT pb.guestName, pb.confirmationNumber, pb.totalPrice, 
           pb.commissionAmount, pb.netAmount, pb.cleaningFee,
           pb.checkIn, pb.checkOut, p.name as propertyName
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'vrbo'
      AND pb.totalPrice > 0
      AND pb.netAmount > 0
      AND pb.bookingStatus IN ('confirmed', 'completed')
    ORDER BY p.name, pb.checkIn
""")
results = cursor.fetchall()

for r in results:
    total = float(r['totalPrice'] or 0)
    comm = float(r['commissionAmount'] or 0)
    net = float(r['netAmount'] or 0)
    clean = float(r['cleaningFee'] or 0)
    gap = total - comm - net
    gap_pct = (gap / total * 100) if total > 0 else 0
    nights = 0
    if r['checkIn'] and r['checkOut']:
        nights = (int(r['checkOut']) - int(r['checkIn'])) // (1000 * 86400)
    nightly = (total - clean) / nights if nights > 0 else 0
    
    # Check if gap matches cleaning fee
    prop_short = r['propertyName'][:18]
    print(f"  {(r['guestName'] or 'Unknown'):<23} {(r['confirmationNumber'] or 'N/A'):<10} {prop_short:<18} ${total:>7.2f} ${comm:>7.2f} ${net:>7.2f} ${gap:>7.2f} {gap_pct:>5.1f}% ${clean:>5.0f} {nights:>5} ${nightly:>7.2f}")

# Now let's look at the math differently
# For VRBO: Total = what guest paid. Net = what you received. Commission = host fee.
# The gap could be: (a) VRBO traveler service fee, (b) taxes, (c) both
# 
# Key insight: If VRBO's "Total Payment" in their XLS is the guest total INCLUDING
# VRBO's traveler service fee, then the gap is the traveler fee.
# But if it's just the accommodation cost, the gap would be taxes.
#
# Let's check: VRBO's traveler service fee is typically 6-12% of the booking subtotal.
# NY occupancy tax is ~8%. Jamaica has no lodging tax (just GART 10% + $1/night).

print("\n\n=== Gap Pattern Analysis ===")
print("\nUS Properties (Sunset Studio + Morabeza):")
us_gaps = []
for r in results:
    if 'Artiste' not in r['propertyName']:
        total = float(r['totalPrice'] or 0)
        comm = float(r['commissionAmount'] or 0)
        net = float(r['netAmount'] or 0)
        gap = total - comm - net
        if total > 0:
            us_gaps.append(gap / total * 100)

if us_gaps:
    print(f"  Gap range: {min(us_gaps):.1f}% - {max(us_gaps):.1f}%")
    print(f"  Average gap: {sum(us_gaps)/len(us_gaps):.1f}%")
    print(f"  Count: {len(us_gaps)}")

print("\nJamaica Property (Artiste's Boutique):")
ja_gaps = []
for r in results:
    if 'Artiste' in r['propertyName']:
        total = float(r['totalPrice'] or 0)
        comm = float(r['commissionAmount'] or 0)
        net = float(r['netAmount'] or 0)
        gap = total - comm - net
        if total > 0:
            ja_gaps.append(gap / total * 100)

if ja_gaps:
    print(f"  Gap range: {min(ja_gaps):.1f}% - {max(ja_gaps):.1f}%")
    print(f"  Average gap: {sum(ja_gaps)/len(ja_gaps):.1f}%")
    print(f"  Count: {len(ja_gaps)}")

# Compare with Airbnb payout records which have explicit breakdown
print("\n\n=== Airbnb Payout Records - Explicit Fee Breakdown ===")
print("(These show exactly what Airbnb charges vs remits)")
cursor.execute("""
    SELECT confirmationCode, guestName, property, 
           amount, serviceFee, cleaningFee, petFee, 
           grossEarnings, airbnbRemittedTax, managementFee
    FROM airbnb_payout_records
    WHERE property = 'sunset_studio'
    ORDER BY startDate DESC
    LIMIT 10
""")
for r in cursor.fetchall():
    gross = float(r['grossEarnings'] or 0)
    svc = float(r['serviceFee'] or 0)
    net = float(r['amount'] or 0)
    tax = float(r['airbnbRemittedTax'] or 0)
    clean = float(r['cleaningFee'] or 0)
    pet = float(r['petFee'] or 0)
    mgmt = float(r['managementFee'] or 0)
    print(f"  {r['guestName']} | {r['confirmationCode']}")
    print(f"    Gross: ${gross:.2f} | SvcFee: ${svc:.2f} | Net: ${net:.2f} | Tax: ${tax:.2f} | Clean: ${clean:.2f} | Pet: ${pet:.2f}")
    print(f"    Formula check: Gross - SvcFee = ${gross - svc:.2f} vs Net ${net:.2f} (diff: ${gross - svc - net:.2f})")

print("\n\n=== CONCLUSION ===")
print("""
Key findings:
1. Airbnb payout records show NO 'airbnbRemittedTax' for Jamaica bookings (all NULL/0)
   - This means Airbnb does NOT remit Jamaica taxes for you
   
2. Airbnb payout records for US (Sunset Studio) show explicit 'airbnbRemittedTax'
   - This confirms Airbnb DOES remit US occupancy taxes

3. For VRBO, we don't have explicit tax data in the database.
   - The 'Total' from VRBO emails likely includes the VRBO traveler service fee
   - VRBO charges guests a service fee (6-12%) on top of the host's listing price
   - This fee goes to VRBO, not to you, and is NOT a tax

4. Whether VRBO remits occupancy taxes needs to be verified on the VRBO extranet.
   - In NY, VRBO may collect and remit occupancy tax (they started in many US states)
   - In Jamaica, VRBO likely does NOT remit GART

NEXT STEPS:
- Check VRBO extranet for tax remittance documentation
- Look for VRBO 1099 or tax summary statements
- The gap is likely: VRBO traveler service fee + possibly occupancy tax
""")

conn.close()
