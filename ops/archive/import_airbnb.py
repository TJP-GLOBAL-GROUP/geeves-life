#!/usr/bin/env python3
"""
Import Airbnb payout CSVs into financial_transactions and airbnb_payout_records tables.
"""

import csv
import os
import re
import sys
from pathlib import Path
from datetime import datetime

try:
    import pymysql
except ImportError:
    os.system("sudo pip3 install pymysql -q")
    import pymysql

UPLOAD_DIR = Path("/home/ubuntu/upload")
AIRBNB_FILES = [
    "airbnb_01_2024-12_2024.csv",
    "airbnb_01_2025-12_2025.csv",
    "airbnb_01_2026-06_2026.csv",
]

# Property name mapping from Airbnb listing name to property_id in DB
# We'll look these up from the DB
LISTING_MAP = {
    "bohemian lodge": "artistes_boutique",
    "artist's boutique": "artistes_boutique",
    "artiste's boutique": "artistes_boutique",
    "morabeza": "morabeza",
    "tropical seneca": "morabeza",
    "sunsets studio": "sunset_studio",
    "seneca sunsets": "sunset_studio",
    "sunset studio": "sunset_studio",
}

HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9"

def get_db_connection():
    db_url = os.environ.get("DATABASE_URL", "")
    m = re.match(r'mysql2?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)', db_url)
    if not m:
        print("ERROR: Could not parse DATABASE_URL")
        sys.exit(1)
    conn = pymysql.connect(
        host=m.group(3), port=int(m.group(4) or 3306),
        user=m.group(1), password=m.group(2), database=m.group(5),
        ssl={"ssl_ca": None, "check_hostname": False, "verify_mode": 0},
        connect_timeout=30,
    )
    return conn

def get_property_ids(conn):
    """Get property IDs from the DB."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM properties WHERE householdId = %s", (HOUSEHOLD_ID,))
    props = {}
    for row in cursor.fetchall():
        pid, name = row
        name_lower = name.lower()
        for key, slug in LISTING_MAP.items():
            if key in name_lower:
                props[slug] = pid
    return props

def identify_property(listing_name):
    """Map Airbnb listing name to property slug."""
    if not listing_name:
        return None
    listing_lower = listing_name.lower()
    for key, slug in LISTING_MAP.items():
        if key in listing_lower:
            return slug
    return None

def parse_amount(val):
    """Parse amount string to float."""
    if not val or val.strip() == "":
        return None
    val = val.replace(",", "").replace("$", "").strip()
    try:
        return float(val)
    except ValueError:
        return None

def parse_date(val):
    """Parse date string MM/DD/YYYY to YYYY-MM-DD."""
    if not val or val.strip() == "":
        return None
    try:
        dt = datetime.strptime(val.strip(), "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None

def main():
    print("Connecting to database...")
    conn = get_db_connection()
    print("Connected!")
    
    # Get property IDs
    prop_ids = get_property_ids(conn)
    print(f"Found properties: {prop_ids}")
    
    cursor = conn.cursor()
    
    total_reservations = 0
    total_payouts = 0
    total_pass_through = 0
    total_other = 0
    total_inserted = 0
    total_skipped = 0
    
    for filename in AIRBNB_FILES:
        filepath = UPLOAD_DIR / filename
        if not filepath.exists():
            print(f"  MISSING: {filename}")
            continue
        
        print(f"\nProcessing: {filename}")
        
        with open(filepath, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        
        print(f"  {len(rows)} rows")
        
        for row in rows:
            row_type = row.get("Type", "").strip()
            
            # Parse common fields
            date_str = parse_date(row.get("Date", ""))
            confirmation = row.get("Confirmation code", "").strip()
            reference = row.get("Reference code", "").strip()
            currency = row.get("Currency", "USD").strip()
            amount = parse_amount(row.get("Amount", ""))
            paid_out = parse_amount(row.get("Paid out", ""))
            service_fee = parse_amount(row.get("Service fee", ""))
            cleaning_fee = parse_amount(row.get("Cleaning fee", ""))
            management_fee = parse_amount(row.get("Management fee", ""))
            gross_earnings = parse_amount(row.get("Gross earnings", ""))
            guest = row.get("Guest", "").strip()
            listing = row.get("Listing", "").strip()
            details = row.get("Details", "").strip()
            start_date = parse_date(row.get("Start date", ""))
            end_date = parse_date(row.get("End date", ""))
            nights = row.get("Nights", "").strip()
            earnings_year = row.get("Earnings year", "").strip()
            
            # Identify property
            prop_slug = identify_property(listing)
            prop_id = prop_ids.get(prop_slug) if prop_slug else None
            
            if row_type == "Payout":
                total_payouts += 1
                if not date_str or paid_out is None:
                    total_skipped += 1
                    continue
                
                # Insert as income transaction in financial_transactions
                try:
                    cursor.execute("""
                        INSERT INTO financial_transactions (
                            householdId, accountId, transactionDate, description,
                            creditAmount, currency, vertical,
                            source, statementYear, referenceNumber,
                            notes, createdAt
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        HOUSEHOLD_ID,
                        4,  # Airbnb Savings 0108 (USD) virtual account
                        date_str,
                        f"Airbnb Payout - {details or 'Transfer to Savings 0108'}",
                        paid_out,
                        currency,
                        "unclassified",  # will be tagged by property later
                        "airbnb_csv",
                        int(date_str[:4]) if date_str else None,
                        reference or None,
                        f"Airbnb payout | ref: {reference}",
                    ))
                    total_inserted += 1
                except Exception as e:
                    print(f"  Error inserting payout: {e}")
                    total_skipped += 1
            
            elif row_type == "Reservation":
                total_reservations += 1
                if not date_str or not confirmation:
                    total_skipped += 1
                    continue
                
                # Identify property slug for the `property` column
                prop_slug_for_col = prop_slug or "unknown"
                
                # Insert into airbnb_payout_records
                try:
                    cursor.execute("""
                        INSERT INTO airbnb_payout_records (
                            householdId, property, recordDate, recordType,
                            confirmationCode, bookingDate, startDate, endDate, nights,
                            guestName, listingName, details, referenceCode, currency,
                            amount, serviceFee, cleaningFee, managementFee,
                            grossEarnings, earningsYear, createdAt
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        HOUSEHOLD_ID,
                        prop_slug_for_col,
                        date_str,
                        "reservation",
                        confirmation,
                        parse_date(row.get("Booking date", "")),
                        start_date,
                        end_date,
                        int(nights) if nights and nights.isdigit() else None,
                        guest or None,
                        listing or None,
                        details or None,
                        reference or None,
                        currency,
                        amount,
                        service_fee,
                        cleaning_fee,
                        management_fee,
                        gross_earnings,
                        int(earnings_year) if earnings_year and earnings_year.isdigit() else None,
                    ))
                    total_inserted += 1
                except pymysql.err.IntegrityError as e:
                    if "Duplicate" in str(e):
                        total_skipped += 1
                    else:
                        print(f"  IntegrityError on reservation: {e}")
                        total_skipped += 1
                except Exception as e:
                    print(f"  Error inserting reservation: {e}")
                    total_skipped += 1
            
            elif row_type == "Pass Through Tot":
                total_pass_through += 1
                # These are tax pass-throughs, insert as financial_transactions
                if not date_str or amount is None:
                    total_skipped += 1
                    continue
                try:
                    cursor.execute("""
                        INSERT INTO financial_transactions (
                            householdId, accountId, transactionDate, description,
                            creditAmount, currency, vertical,
                            source, statementYear, referenceNumber,
                            notes, createdAt
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        HOUSEHOLD_ID,
                        4,
                        date_str,
                        f"Airbnb Pass-Through Tax - {listing or ''} {details or ''}".strip(),
                        amount,
                        currency,
                        "unclassified",
                        "airbnb_csv",
                        int(date_str[:4]) if date_str else None,
                        confirmation or None,
                        f"Pass-through tax | {confirmation} | {listing}",
                    ))
                    total_inserted += 1
                except Exception as e:
                    print(f"  Error inserting pass-through: {e}")
                    total_skipped += 1
            
            else:
                total_other += 1
                # Resolution, Adjustment, etc.
                if not date_str:
                    total_skipped += 1
                    continue
                credit = amount if amount and amount > 0 else None
                debit = abs(amount) if amount and amount < 0 else None
                try:
                    cursor.execute("""
                        INSERT INTO financial_transactions (
                            householdId, accountId, transactionDate, description,
                            debitAmount, creditAmount, currency, vertical,
                            source, statementYear, referenceNumber,
                            notes, createdAt
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        HOUSEHOLD_ID,
                        4,
                        date_str,
                        f"Airbnb {row_type} - {listing or details or ''}".strip(),
                        debit,
                        credit,
                        currency,
                        "unclassified",
                        "airbnb_csv",
                        int(date_str[:4]) if date_str else None,
                        confirmation or reference or None,
                        f"Airbnb {row_type} | {confirmation} | {listing}",
                    ))
                    total_inserted += 1
                except Exception as e:
                    print(f"  Error inserting {row_type}: {e}")
                    total_skipped += 1
        
        conn.commit()
    
    conn.close()
    
    print(f"\n=== AIRBNB IMPORT DONE ===")
    print(f"Reservations processed: {total_reservations}")
    print(f"Payouts processed: {total_payouts}")
    print(f"Pass-throughs processed: {total_pass_through}")
    print(f"Other types: {total_other}")
    print(f"Total inserted: {total_inserted}")
    print(f"Total skipped: {total_skipped}")

if __name__ == "__main__":
    main()
