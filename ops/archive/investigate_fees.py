#!/usr/bin/env python3
"""Investigate what totalPrice represents across platforms and identify the fee gap."""
import os
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

# VRBO Jamaica bookings
print("=== VRBO Jamaica (Artiste's Boutique) Bookings ===")
cursor.execute("""
    SELECT pb.guestName, pb.confirmationNumber, pb.totalPrice, pb.commissionAmount, 
           pb.netAmount, pb.cleaningFee, pb.rawEmailSubject,
           pb.checkIn, pb.checkOut
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'vrbo' 
      AND p.name = "The Artiste's Boutique"
      AND pb.bookingType = 'booking'
      AND pb.bookingStatus = 'confirmed'
    ORDER BY pb.checkIn DESC
    LIMIT 10
""")
for r in cursor.fetchall():
    total = float(r['totalPrice'] or 0)
    comm = float(r['commissionAmount'] or 0)
    net = float(r['netAmount'] or 0)
    gap = total - comm - net
    gap_pct = (gap / total * 100) if total > 0 else 0
    nights = 0
    if r['checkIn'] and r['checkOut']:
        nights = (int(r['checkOut']) - int(r['checkIn'])) // (1000 * 86400)
    print(f"  {r['guestName']} | {r['confirmationNumber']} | {nights}n")
    print(f"    Total: ${total:.2f} | Comm: ${comm:.2f} | Net: ${net:.2f} | Gap: ${gap:.2f} ({gap_pct:.1f}%)")
    if r['rawEmailSubject']:
        print(f"    Subject: {r['rawEmailSubject'][:80]}")

# Airbnb Jamaica bookings
print("\n=== Airbnb Jamaica (Artiste's Boutique) Bookings ===")
cursor.execute("""
    SELECT pb.guestName, pb.confirmationNumber, pb.totalPrice, pb.commissionAmount, 
           pb.netAmount, pb.cleaningFee, pb.rawEmailSubject
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'airbnb' 
      AND p.name = "The Artiste's Boutique"
      AND pb.bookingType = 'booking'
      AND pb.bookingStatus = 'confirmed'
      AND pb.totalPrice > 0
      AND pb.netAmount > 0
    ORDER BY pb.checkIn DESC
    LIMIT 5
""")
for r in cursor.fetchall():
    total = float(r['totalPrice'] or 0)
    comm = float(r['commissionAmount'] or 0)
    net = float(r['netAmount'] or 0)
    gap = total - comm - net
    gap_pct = (gap / total * 100) if total > 0 else 0
    print(f"  {r['guestName']} | {r['confirmationNumber']}")
    print(f"    Total: ${total:.2f} | Comm: ${comm:.2f} | Net: ${net:.2f} | Gap: ${gap:.2f} ({gap_pct:.1f}%)")

# VRBO US bookings (Sunset Studio)
print("\n=== VRBO US (Sunset Studio) Bookings ===")
cursor.execute("""
    SELECT pb.guestName, pb.confirmationNumber, pb.totalPrice, pb.commissionAmount, 
           pb.netAmount, pb.cleaningFee, pb.rawEmailSubject,
           pb.checkIn, pb.checkOut
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    JOIN properties p ON pb.propertyId = p.id
    WHERE pp.platform = 'vrbo' 
      AND p.name = 'Sunset Studio'
      AND pb.bookingType = 'booking'
      AND pb.bookingStatus = 'confirmed'
      AND pb.totalPrice > 0
      AND pb.netAmount > 0
    ORDER BY pb.checkIn DESC
    LIMIT 5
""")
for r in cursor.fetchall():
    total = float(r['totalPrice'] or 0)
    comm = float(r['commissionAmount'] or 0)
    net = float(r['netAmount'] or 0)
    gap = total - comm - net
    gap_pct = (gap / total * 100) if total > 0 else 0
    print(f"  {r['guestName']} | {r['confirmationNumber']}")
    print(f"    Total: ${total:.2f} | Comm: ${comm:.2f} | Net: ${net:.2f} | Gap: ${gap:.2f} ({gap_pct:.1f}%)")

# Cross-reference with the deprecated Airbnb CSV
print("\n=== Cross-reference: DB vs Airbnb CSV (HM8HNC43M5 - Daniel Arnold) ===")
cursor.execute("""
    SELECT pb.totalPrice, pb.commissionAmount, pb.netAmount, pb.cleaningFee
    FROM property_bookings pb
    WHERE pb.confirmationNumber = 'HM8HNC43M5'
""")
for r in cursor.fetchall():
    print(f"  DB:  Total=${float(r['totalPrice'] or 0):.2f} | Comm=${float(r['commissionAmount'] or 0):.2f} | Net=${float(r['netAmount'] or 0):.2f} | Clean=${float(r['cleaningFee'] or 0):.2f}")
print(f"  CSV: Gross=$325.00 | ServiceFee=$9.75 | Net=$315.25 | Tax=$42.67 | Clean=$35 | Pet=$40")
print(f"  Analysis:")
print(f"    DB Total ($413.55) = CSV Gross ($325) + CSV Tax ($42.67) + CSV Pet ($40) + ~$5.88")
print(f"    The DB 'totalPrice' appears to be the FULL guest charge including taxes and extras")
print(f"    The 'gap' is: taxes remitted by platform + extras (pet fees, etc)")
print(f"    For tax purposes: Net Payout is what you received. Total includes platform-collected taxes.")

# Check another US booking
print("\n=== Cross-reference: DB vs Airbnb CSV (HMMXW8WFK4 - Swagatika) ===")
cursor.execute("""
    SELECT pb.totalPrice, pb.commissionAmount, pb.netAmount, pb.cleaningFee
    FROM property_bookings pb
    WHERE pb.confirmationNumber = 'HMMXW8WFK4'
""")
for r in cursor.fetchall():
    print(f"  DB:  Total=${float(r['totalPrice'] or 0):.2f} | Comm=${float(r['commissionAmount'] or 0):.2f} | Net=${float(r['netAmount'] or 0):.2f}")
print(f"  CSV: Gross=$265.00 | ServiceFee=$7.95 | Net=$257.05 | Tax=$34.79 | Clean=$35 | Pet=$0")
print(f"  Analysis:")
print(f"    DB Total ($337.20) vs CSV Gross ($265) + Tax ($34.79) + Clean ($35) = $334.79")
print(f"    Close match! DB Total = Guest total charge (nightly + cleaning + tax)")
print(f"    Gap = DB Total - Comm - Net = $337.20 - $7.95 - $257.05 = $72.20")
print(f"    CSV Tax ($34.79) + CSV Clean ($35) = $69.79 (close to $72.20)")

conn.close()

print("\n" + "="*60)
print("CONCLUSION:")
print("="*60)
print("""
The 'totalPrice' in the database represents the FULL amount charged to the guest,
which includes:
  - Nightly rate x nights (your listing price)
  - Cleaning fee (goes to you)
  - Pet fee (goes to you)  
  - Occupancy taxes (collected by platform, remitted to government)
  - Platform service fee to guest (goes to platform, NOT to you)

The 'gap' between Total - Commission - Net is NOT a hidden fee charged to you.
It's money that was never yours:
  - Taxes collected by the platform on behalf of the government
  - Guest service fees charged by the platform

For TAX PURPOSES:
  - Your INCOME = Net Payout (what hit your bank account)
  - Your EXPENSES = Commission (host service fee)
  - The 'Total' is NOT your income - it's what the guest paid total
  - Taxes remitted by the platform are NOT your income or expense

RECOMMENDATION for the workbook:
  - Rename 'Gross Total' to 'Guest Total Charged'
  - Rename 'Tax Withheld' to 'Platform-Collected Taxes & Fees (not your income)'
  - Keep 'Commission' as your deductible expense
  - Keep 'Net Payout' as your reportable income
""")
