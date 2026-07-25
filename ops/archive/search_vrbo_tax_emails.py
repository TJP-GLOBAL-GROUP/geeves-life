#!/usr/bin/env python3
"""Search email archives for VRBO tax statements, 1099s, and tax remittance info."""
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

# First, find all tables that might contain emails
cursor.execute("SHOW TABLES")
tables = [r[list(r.keys())[0]] for r in cursor.fetchall()]
print(f"All tables: {tables}")

# Look for email-related tables
email_tables = [t for t in tables if 'email' in t.lower() or 'message' in t.lower() or 'mail' in t.lower()]
print(f"\nEmail-related tables: {email_tables}")

# Search for VRBO tax-related emails in any table that has subject/body
for table in tables:
    cursor.execute(f"SHOW COLUMNS FROM `{table}`")
    cols = [r['Field'] for r in cursor.fetchall()]
    
    # Look for subject-like columns
    subject_cols = [c for c in cols if 'subject' in c.lower() or 'title' in c.lower()]
    body_cols = [c for c in cols if 'body' in c.lower() or 'content' in c.lower() or 'snippet' in c.lower()]
    
    if subject_cols or body_cols:
        for col in subject_cols + body_cols:
            # Search for VRBO tax-related content
            for keyword in ['tax', '1099', 'remit', 'occupancy', 'GART', 'lodging tax']:
                cursor.execute(f"""
                    SELECT * FROM `{table}` 
                    WHERE `{col}` LIKE %s 
                    AND (`{col}` LIKE '%vrbo%' OR `{col}` LIKE '%VRBO%' OR `{col}` LIKE '%Vrbo%')
                    LIMIT 5
                """, (f'%{keyword}%',))
                results = cursor.fetchall()
                if results:
                    print(f"\n{'='*60}")
                    print(f"FOUND in {table}.{col} (keyword: '{keyword}'):")
                    for r in results:
                        # Print relevant fields
                        for k, v in r.items():
                            if v and isinstance(v, str) and len(str(v)) < 500:
                                print(f"  {k}: {v}")
                            elif v and isinstance(v, str):
                                print(f"  {k}: {v[:200]}...")
                        print("---")

# Also search for Airbnb tax emails for comparison
print("\n\n=== AIRBNB TAX EMAILS ===")
for table in tables:
    cursor.execute(f"SHOW COLUMNS FROM `{table}`")
    cols = [r['Field'] for r in cursor.fetchall()]
    subject_cols = [c for c in cols if 'subject' in c.lower() or 'title' in c.lower()]
    
    for col in subject_cols:
        for keyword in ['tax', '1099']:
            cursor.execute(f"""
                SELECT * FROM `{table}` 
                WHERE `{col}` LIKE %s 
                AND (`{col}` LIKE '%airbnb%' OR `{col}` LIKE '%Airbnb%')
                LIMIT 5
            """, (f'%{keyword}%',))
            results = cursor.fetchall()
            if results:
                print(f"\nFOUND in {table}.{col} (keyword: '{keyword}'):")
                for r in results:
                    for k, v in r.items():
                        if v and isinstance(v, str) and len(str(v)) < 300:
                            print(f"  {k}: {v}")
                    print("---")

# Also search for any payout statement emails from VRBO
print("\n\n=== VRBO PAYOUT/STATEMENT EMAILS ===")
for table in tables:
    cursor.execute(f"SHOW COLUMNS FROM `{table}`")
    cols = [r['Field'] for r in cursor.fetchall()]
    subject_cols = [c for c in cols if 'subject' in c.lower() or 'title' in c.lower()]
    
    for col in subject_cols:
        for keyword in ['payout', 'statement', 'payment', 'earning']:
            cursor.execute(f"""
                SELECT * FROM `{table}` 
                WHERE `{col}` LIKE %s 
                AND (`{col}` LIKE '%vrbo%' OR `{col}` LIKE '%VRBO%' OR `{col}` LIKE '%Vrbo%')
                LIMIT 3
            """, (f'%{keyword}%',))
            results = cursor.fetchall()
            if results:
                print(f"\nFOUND in {table}.{col} (keyword: '{keyword}'):")
                for r in results:
                    for k, v in r.items():
                        if v and isinstance(v, str) and len(str(v)) < 300:
                            print(f"  {k}: {v}")
                    print("---")

conn.close()
