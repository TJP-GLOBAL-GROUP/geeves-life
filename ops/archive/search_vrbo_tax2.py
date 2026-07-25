#!/usr/bin/env python3
"""Search for VRBO tax documentation in email subjects and financial docs."""
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

# Check VRBO email subjects
print("=== VRBO email subjects (all) ===")
cursor.execute("""
    SELECT pb.rawEmailSubject, pb.guestName, pb.confirmationNumber
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pp.platform = 'vrbo'
      AND pb.rawEmailSubject IS NOT NULL
      AND pb.rawEmailSubject != ''
    LIMIT 20
""")
for r in cursor.fetchall():
    print(f"  {r['confirmationNumber']}: {r['rawEmailSubject']}")

# Check financial_documents table
print("\n=== financial_documents columns ===")
cursor.execute("SHOW COLUMNS FROM financial_documents")
for r in cursor.fetchall():
    print(f"  {r['Field']} ({r['Type']})")

cursor.execute("SELECT * FROM financial_documents LIMIT 5")
for r in cursor.fetchall():
    print(f"  {r}")

# Check airbnb_payout_records for comparison
print("\n=== airbnb_payout_records columns ===")
cursor.execute("SHOW COLUMNS FROM airbnb_payout_records")
for r in cursor.fetchall():
    print(f"  {r['Field']} ({r['Type']})")

cursor.execute("SELECT * FROM airbnb_payout_records LIMIT 3")
for r in cursor.fetchall():
    for k, v in r.items():
        if v:
            print(f"  {k}: {v}")
    print("---")

# Search property_bookings for any tax-related data
print("\n=== property_bookings columns (check for tax fields) ===")
cursor.execute("SHOW COLUMNS FROM property_bookings")
cols = cursor.fetchall()
tax_cols = [r for r in cols if 'tax' in r['Field'].lower() or 'fee' in r['Field'].lower() or 'service' in r['Field'].lower()]
print(f"  Tax/fee related columns: {[r['Field'] for r in tax_cols]}")

# Check what the email scraper extracted - look at raw data for a VRBO booking with financials
print("\n=== VRBO booking with financials (Sunset Studio) - checking raw data ===")
cursor.execute("""
    SELECT pb.id, pb.guestName, pb.confirmationNumber, pb.totalPrice, 
           pb.commissionAmount, pb.netAmount, pb.cleaningFee,
           pb.rawEmailSubject
    FROM property_bookings pb
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pp.platform = 'vrbo'
      AND pb.totalPrice > 0
      AND pb.netAmount > 0
    LIMIT 5
""")
for r in cursor.fetchall():
    total = float(r['totalPrice'] or 0)
    comm = float(r['commissionAmount'] or 0)
    net = float(r['netAmount'] or 0)
    gap = total - comm - net
    print(f"\n  {r['guestName']} | {r['confirmationNumber']}")
    print(f"    Total: ${total:.2f} | Comm: ${comm:.2f} | Net: ${net:.2f} | Gap: ${gap:.2f}")
    print(f"    CleaningFee: ${float(r['cleaningFee'] or 0):.2f}")
    print(f"    Subject: {r['rawEmailSubject']}")

# Also check the Airbnb payout records which have explicit tax column
print("\n=== Airbnb payout records with tax data (airbnbRemittedTax) ===")
cursor.execute("""
    SELECT confirmationCode, guestName, property, amount, serviceFee, 
           cleaningFee, grossEarnings, airbnbRemittedTax, petFee
    FROM airbnb_payout_records
    WHERE airbnbRemittedTax IS NOT NULL AND airbnbRemittedTax > 0
    LIMIT 5
""")
for r in cursor.fetchall():
    print(f"  {r['guestName']} | {r['confirmationCode']} | {r['property']}")
    print(f"    Gross: ${float(r['grossEarnings'] or 0):.2f} | ServiceFee: ${float(r['serviceFee'] or 0):.2f} | Net: ${float(r['amount'] or 0):.2f}")
    print(f"    Tax Remitted: ${float(r['airbnbRemittedTax'] or 0):.2f} | Clean: ${float(r['cleaningFee'] or 0):.2f} | Pet: ${float(r['petFee'] or 0):.2f}")

conn.close()
