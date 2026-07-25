#!/usr/bin/env python3
"""
Insert parsed bank statement transactions into the financial_transactions table.
Reads from parsed_transactions.json and inserts into MySQL via pymysql.
"""

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

# Install pymysql if needed
try:
    import pymysql
except ImportError:
    os.system("sudo pip3 install pymysql -q")
    import pymysql

UPLOAD_DIR = Path("/home/ubuntu/upload")
INPUT_FILE = UPLOAD_DIR / "parsed_transactions.json"

def get_db_connection():
    """Get MySQL connection from DATABASE_URL environment variable."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        # Try to read from the project env
        env_file = Path("/home/ubuntu/geeves-shopping/.env")
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    
    if not db_url:
        # Try to get from the running process environment
        try:
            import subprocess
            result = subprocess.run(
                ["node", "-e", "console.log(process.env.DATABASE_URL || '')"],
                capture_output=True, text=True,
                cwd="/home/ubuntu/geeves-shopping"
            )
            db_url = result.stdout.strip()
        except Exception:
            pass
    
    if not db_url:
        print("ERROR: Could not find DATABASE_URL")
        sys.exit(1)
    
    # Parse the URL
    # Format: mysql://user:pass@host:port/dbname?ssl=...
    m = re.match(r'mysql(?:2)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)', db_url)
    if not m:
        print(f"ERROR: Could not parse DATABASE_URL: {db_url[:50]}...")
        sys.exit(1)
    
    user = m.group(1)
    password = m.group(2)
    host = m.group(3)
    port = int(m.group(4)) if m.group(4) else 3306
    database = m.group(5)
    
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        ssl={"ssl_ca": None, "check_hostname": False, "verify_mode": 0},
        connect_timeout=30,
    )
    return conn

def insert_transactions(conn, transactions, filename):
    """Insert a batch of transactions into financial_transactions."""
    cursor = conn.cursor()
    
    inserted = 0
    skipped = 0
    
    for tx in transactions:
        # Skip if no date or both amounts are None
        if not tx.get("transactionDate"):
            skipped += 1
            continue
        
        if tx.get("debitAmount") is None and tx.get("creditAmount") is None:
            skipped += 1
            continue
        
        try:
            cursor.execute("""
                INSERT INTO financial_transactions (
                    householdId, accountId, transactionDate, postingDate,
                    description, debitAmount, creditAmount, balance,
                    currency, vertical, aiConfidence, source,
                    statementYear, statementMonth, referenceNumber,
                    notes, createdAt
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, NOW()
                )
            """, (
                tx.get("householdId"),
                tx.get("accountId"),
                tx.get("transactionDate", "")[:10],  # DATE only
                tx.get("postingDate", "")[:10] if tx.get("postingDate") else None,
                tx.get("description", "")[:500],
                tx.get("debitAmount"),
                tx.get("creditAmount"),
                tx.get("balance"),
                tx.get("currency", "JMD"),
                tx.get("vertical", "unclassified"),
                tx.get("aiConfidence", 0),
                tx.get("source", "bank_statement"),
                tx.get("statementYear"),
                tx.get("statementMonth"),
                tx.get("referenceNumber"),
                f"Source file: {filename}",
            ))
            inserted += 1
        except pymysql.err.IntegrityError as e:
            if "Duplicate" in str(e):
                skipped += 1
            else:
                print(f"  IntegrityError: {e}")
                skipped += 1
        except Exception as e:
            print(f"  Error inserting tx: {e}")
            skipped += 1
    
    conn.commit()
    return inserted, skipped

def main():
    print("Loading parsed transactions...")
    with open(INPUT_FILE) as f:
        all_results = json.load(f)
    
    total_txns = sum(r["transaction_count"] for r in all_results)
    print(f"Loaded {len(all_results)} statements, {total_txns} total transactions")
    
    print("\nConnecting to database...")
    conn = get_db_connection()
    print("Connected!")
    
    total_inserted = 0
    total_skipped = 0
    
    for result in all_results:
        filename = result["filename"]
        transactions = result["transactions"]
        
        if not transactions:
            continue
        
        inserted, skipped = insert_transactions(conn, transactions, filename)
        total_inserted += inserted
        total_skipped += skipped
        
        if inserted > 0:
            print(f"  {filename}: {inserted} inserted, {skipped} skipped")
    
    conn.close()
    
    print(f"\n=== DONE ===")
    print(f"Total inserted: {total_inserted}")
    print(f"Total skipped: {total_skipped}")

if __name__ == "__main__":
    main()
