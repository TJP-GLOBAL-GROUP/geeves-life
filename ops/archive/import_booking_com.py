#!/usr/bin/env python3
"""
Import Booking.com reservation data from the downloaded XLS into the Geeves database.
Maps properties:
  - Bohemian Lodge - Artist's Boutique (ID 12661610) → The Artiste's Boutique
  - The Seneca Sunset Suites (ID 14569041) → Sunset Studio
"""

import os
import pandas as pd
import mysql.connector
import subprocess
from urllib.parse import urlparse
from datetime import datetime
import hashlib
import math

# --- Database connection ---
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

# --- Read the XLS file ---
xls_path = '/home/ubuntu/Downloads/Reservations_2025-01-01_2025-12-31.xls'
df = pd.read_excel(xls_path)
print(f"Loaded {len(df)} rows from Booking.com XLS")

# --- Get property and platform mappings ---
cursor.execute("SELECT id, name FROM properties WHERE isActive = 1")
properties = {r['name']: r['id'] for r in cursor.fetchall()}
print(f"Properties in DB: {properties}")

# Find existing Booking.com platforms
cursor.execute("SELECT id, propertyId, platform, displayName FROM property_platforms WHERE platform = 'booking_com'")
booking_platforms_raw = cursor.fetchall()
booking_platforms = {r['propertyId']: r['id'] for r in booking_platforms_raw}
print(f"Existing Booking.com platforms: {booking_platforms}")

# Map Booking.com property names to our DB property names
BOOKING_TO_DB_PROPERTY = {
    "Bohemian Lodge - Artist's Boutique": "The Artiste's Boutique",
    "The Seneca Sunset Suites": "Sunset Studio",
}

# --- Process each reservation ---
imported = 0
skipped_existing = 0
skipped_cancelled = 0
skipped_noshow = 0
errors = 0

for idx, row in df.iterrows():
    booking_property = row['Property Name']
    db_property_name = BOOKING_TO_DB_PROPERTY.get(booking_property)
    
    if not db_property_name:
        print(f"  WARNING: Unknown property '{booking_property}' - skipping")
        errors += 1
        continue
    
    property_id = properties.get(db_property_name)
    if not property_id:
        print(f"  WARNING: Property '{db_property_name}' not found in DB - skipping")
        errors += 1
        continue
    
    platform_id = booking_platforms.get(property_id)
    if not platform_id:
        print(f"  WARNING: No Booking.com platform for property '{db_property_name}' - skipping")
        errors += 1
        continue
    
    # Parse status
    status = row['Status']
    if status == 'Canceled':
        skipped_cancelled += 1
        # Still import cancelled bookings with cancelled status
        booking_status = 'cancelled'
    elif status == 'No-show':
        skipped_noshow += 1
        booking_status = 'cancelled'  # Treat no-shows as cancelled for now
    elif status == 'OK':
        booking_status = 'confirmed'
    else:
        booking_status = 'confirmed'
    
    # Parse dates
    try:
        arrival = datetime.strptime(str(row['Arrival']), '%B %d, %Y')
        departure = datetime.strptime(str(row['Departure']), '%B %d, %Y')
    except (ValueError, TypeError) as e:
        print(f"  ERROR parsing dates for row {idx}: {e}")
        errors += 1
        continue
    
    check_in_ms = int(arrival.timestamp() * 1000)
    check_out_ms = int(departure.timestamp() * 1000)
    nights = (departure - arrival).days
    
    # Parse financials
    total_payment = float(row['Total Payment']) if not pd.isna(row['Total Payment']) else 0
    commission = float(row['Commission']) if not pd.isna(row['Commission']) else 0
    net_amount = total_payment - commission if total_payment > 0 else 0
    
    # Confirmation number
    confirmation = str(int(row['Reservation Number'])) if not pd.isna(row['Reservation Number']) else ''
    
    # Guest name
    guest_name = str(row['Booker Name']) if not pd.isna(row['Booker Name']) else ''
    
    # Check if already exists
    cursor.execute(
        "SELECT id FROM property_bookings WHERE confirmationNumber = %s AND propertyId = %s",
        (confirmation, property_id)
    )
    existing = cursor.fetchone()
    
    if existing:
        skipped_existing += 1
        continue
    
    # Generate unique ID
    uid = hashlib.md5(f"booking-{confirmation}-{property_id}".encode()).hexdigest()[:20]
    
    # Generate iCal UID
    ical_uid = f"booking-com-{confirmation}@geeves.life"
    
    # Insert
    cursor.execute("""
        INSERT INTO property_bookings (
            id, propertyId, platformId, icalUid, bookingType, 
            checkIn, checkOut, guestName, 
            totalPrice, commissionAmount, netAmount, currency,
            confirmationNumber, bookingStatus, dataSource,
            createdAt, updatedAt
        ) VALUES (
            %s, %s, %s, %s, 'booking',
            %s, %s, %s,
            %s, %s, %s, 'USD',
            %s, %s, 'email_only',
            NOW(), NOW()
        )
    """, (
        uid, property_id, platform_id, ical_uid,
        check_in_ms, check_out_ms, guest_name,
        total_payment, commission, net_amount,
        confirmation, booking_status
    ))
    imported += 1

conn.commit()

print(f"\n{'='*60}")
print(f"Import Results:")
print(f"  Imported: {imported}")
print(f"  Skipped (already exists): {skipped_existing}")
print(f"  Cancelled bookings imported: {skipped_cancelled}")
print(f"  No-show bookings imported: {skipped_noshow}")
print(f"  Errors: {errors}")
print(f"{'='*60}")

# Verify
cursor.execute("""
    SELECT p.name, COUNT(*) as cnt, SUM(pb.totalPrice) as gross, SUM(pb.netAmount) as net
    FROM property_bookings pb
    JOIN properties p ON pb.propertyId = p.id
    JOIN property_platforms pp ON pb.platformId = pp.id
    WHERE pp.platform = 'booking'
    GROUP BY p.name
""")
results = cursor.fetchall()
print(f"\nBooking.com data in database:")
for r in results:
    print(f"  {r['name']}: {r['cnt']} bookings | Gross: ${float(r['gross'] or 0):,.2f} | Net: ${float(r['net'] or 0):,.2f}")

conn.close()
