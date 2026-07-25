"""
Insert financial_documents records for all 61 uploaded bank statement PDFs.
Maps each file to its account_id and stores the S3 URL.
"""
import pymysql, re, os

DB_URL = os.environ['DATABASE_URL']
m = re.match(r'mysql2?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)', DB_URL)
conn = pymysql.connect(
    host=m.group(3), port=int(m.group(4) or 3306),
    user=m.group(1), password=m.group(2), database=m.group(5),
    ssl={'ssl_ca': None, 'check_hostname': False, 'verify_mode': 0}
)
cursor = conn.cursor()

HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9'
BASE_URL = 'https://geeveshop-mhfpbzgg.manus.space'

# Account IDs:
# 1 = Scotia Chequing #620505
# 2 = Scotia Gold Mastercard ****6376
# 3 = Scotia Aero Platinum Mastercard ****6138

# All statements with their S3 paths and account mappings
# 2024: no-suffix = Gold MC (acct 2), (1) = Aero Platinum (acct 3)
# 2025: no-suffix = Chequing (acct 1), (1) = Gold MC (acct 2), (2) = Aero Platinum (acct 3)

statements = [
    # 2024 Gold Mastercard (no suffix)
    ("January2024e-statement_29f9c606.pdf", 2, 2024, 1, "Scotia Gold Mastercard Statement - January 2024"),
    ("February2024e-statement_b81d238c.pdf", 2, 2024, 2, "Scotia Gold Mastercard Statement - February 2024"),
    ("March2024e-statement_14df2c03.pdf", 2, 2024, 3, "Scotia Gold Mastercard Statement - March 2024"),
    ("April2024e-statement_8d445304.pdf", 2, 2024, 4, "Scotia Gold Mastercard Statement - April 2024"),
    ("May2024e-statement_f8d75c69.pdf", 2, 2024, 5, "Scotia Gold Mastercard Statement - May 2024"),
    ("June2024e-statement_331a1187.pdf", 2, 2024, 6, "Scotia Gold Mastercard Statement - June 2024"),
    ("July2024e-statement_7e43c54e.pdf", 2, 2024, 7, "Scotia Gold Mastercard Statement - July 2024"),
    ("August2024e-statement_b8699189.pdf", 2, 2024, 8, "Scotia Gold Mastercard Statement - August 2024"),
    ("September2024e-statement_39ba9343.pdf", 2, 2024, 9, "Scotia Gold Mastercard Statement - September 2024"),
    ("October2024e-statement_0fb5e081.pdf", 2, 2024, 10, "Scotia Gold Mastercard Statement - October 2024"),
    ("November2024e-statement_d4ef3749.pdf", 2, 2024, 11, "Scotia Gold Mastercard Statement - November 2024"),
    ("December2024e-statement_065f3e88.pdf", 2, 2024, 12, "Scotia Gold Mastercard Statement - December 2024"),
    # 2024 Aero Platinum Mastercard (1) suffix
    ("January2024e-statement(1)_38acaaeb.pdf", 3, 2024, 1, "Scotia Aero Platinum Mastercard Statement - January 2024"),
    ("February2024e-statement(1)_8bc4f80e.pdf", 3, 2024, 2, "Scotia Aero Platinum Mastercard Statement - February 2024"),
    ("March2024e-statement(1)_cd7c690b.pdf", 3, 2024, 3, "Scotia Aero Platinum Mastercard Statement - March 2024"),
    ("April2024e-statement(1)_e23c6b39.pdf", 3, 2024, 4, "Scotia Aero Platinum Mastercard Statement - April 2024"),
    ("May2024e-statement(1)_b865e7fa.pdf", 3, 2024, 5, "Scotia Aero Platinum Mastercard Statement - May 2024"),
    ("June2024e-statement(1)_9a39a05a.pdf", 3, 2024, 6, "Scotia Aero Platinum Mastercard Statement - June 2024"),
    ("July2024e-statement(1)_d2dbe193.pdf", 3, 2024, 7, "Scotia Aero Platinum Mastercard Statement - July 2024"),
    ("August2024e-statement(1)_bc199a48.pdf", 3, 2024, 8, "Scotia Aero Platinum Mastercard Statement - August 2024"),
    ("September2024e-statement(1)_2abc6270.pdf", 3, 2024, 9, "Scotia Aero Platinum Mastercard Statement - September 2024"),
    ("October2024e-statement(1)_8517c12a.pdf", 3, 2024, 10, "Scotia Aero Platinum Mastercard Statement - October 2024"),
    ("November2024e-statement(1)_ee8c75c1.pdf", 3, 2024, 11, "Scotia Aero Platinum Mastercard Statement - November 2024"),
    ("December2024e-statement(1)_aecdd87f.pdf", 3, 2024, 12, "Scotia Aero Platinum Mastercard Statement - December 2024"),
    # 2025 Chequing (no suffix)
    ("January2025e-statement_18492723.pdf", 1, 2025, 1, "Scotia Chequing #620505 Statement - January 2025"),
    ("February2025e-statement_12c12677.pdf", 1, 2025, 2, "Scotia Chequing #620505 Statement - February 2025"),
    ("March2025e-statement_6ddcd03d.pdf", 1, 2025, 3, "Scotia Chequing #620505 Statement - March 2025"),
    ("April2025e-statement_9ba868cd.pdf", 1, 2025, 4, "Scotia Chequing #620505 Statement - April 2025"),
    ("May2025e-statement_b2d0fe14.pdf", 1, 2025, 5, "Scotia Chequing #620505 Statement - May 2025"),
    ("June2025e-statement_7a8d8d9d.pdf", 1, 2025, 6, "Scotia Chequing #620505 Statement - June 2025"),
    ("July2025e-statement_04ed3eb9.pdf", 1, 2025, 7, "Scotia Chequing #620505 Statement - July 2025"),
    ("August2025e-statement_8946e0ff.pdf", 1, 2025, 8, "Scotia Chequing #620505 Statement - August 2025"),
    ("September2025e-statement_d6be57ab.pdf", 1, 2025, 9, "Scotia Chequing #620505 Statement - September 2025"),
    ("October2025e-statement_06db1d66.pdf", 1, 2025, 10, "Scotia Chequing #620505 Statement - October 2025"),
    ("November2025e-statement_26830093.pdf", 1, 2025, 11, "Scotia Chequing #620505 Statement - November 2025"),
    ("December2025e-statement_58ae78a1.pdf", 1, 2025, 12, "Scotia Chequing #620505 Statement - December 2025"),
    # 2025 Gold Mastercard (1) suffix
    ("January2025e-statement(1)_06dba37b.pdf", 2, 2025, 1, "Scotia Gold Mastercard Statement - January 2025"),
    ("February2025e-statement(1)_fd70621a.pdf", 2, 2025, 2, "Scotia Gold Mastercard Statement - February 2025"),
    ("March2025e-statement(1)_3daf0a28.pdf", 2, 2025, 3, "Scotia Gold Mastercard Statement - March 2025"),
    ("April2025e-statement(1)_5bcc8d2c.pdf", 2, 2025, 4, "Scotia Gold Mastercard Statement - April 2025"),
    ("May2025e-statement(1)_2cf985ce.pdf", 2, 2025, 5, "Scotia Gold Mastercard Statement - May 2025"),
    ("June2025e-statement(1)_7e5e9f9a.pdf", 2, 2025, 6, "Scotia Gold Mastercard Statement - June 2025"),
    ("July2025e-statement(1)_45b03f21.pdf", 2, 2025, 7, "Scotia Gold Mastercard Statement - July 2025"),
    ("August2025e-statement(1)_0a9623be.pdf", 2, 2025, 8, "Scotia Gold Mastercard Statement - August 2025"),
    ("September2025e-statement(1)_fe261730.pdf", 2, 2025, 9, "Scotia Gold Mastercard Statement - September 2025"),
    ("October2025e-statement(1)_53d2c955.pdf", 2, 2025, 10, "Scotia Gold Mastercard Statement - October 2025"),
    ("November2025e-statement(1)_38ddc6fd.pdf", 2, 2025, 11, "Scotia Gold Mastercard Statement - November 2025"),
    ("December2025e-statement(1)_0fb62831.pdf", 2, 2025, 12, "Scotia Gold Mastercard Statement - December 2025"),
    # 2025 Aero Platinum Mastercard (2) suffix
    ("January2025e-statement(2)_518e7543.pdf", 3, 2025, 1, "Scotia Aero Platinum Mastercard Statement - January 2025"),
    ("February2025e-statement(2)_ef6ca6da.pdf", 3, 2025, 2, "Scotia Aero Platinum Mastercard Statement - February 2025"),
    ("March2025e-statement(2)_69d04a01.pdf", 3, 2025, 3, "Scotia Aero Platinum Mastercard Statement - March 2025"),
    ("April2025e-statement(2)_ead6f1fd.pdf", 3, 2025, 4, "Scotia Aero Platinum Mastercard Statement - April 2025"),
    ("May2025e-statement(2)_4fd78ca8.pdf", 3, 2025, 5, "Scotia Aero Platinum Mastercard Statement - May 2025"),
    ("June2025e-statement(2)_974e9cdd.pdf", 3, 2025, 6, "Scotia Aero Platinum Mastercard Statement - June 2025"),
    ("July2025e-statement(2)_b74d7ce2.pdf", 3, 2025, 7, "Scotia Aero Platinum Mastercard Statement - July 2025"),
    ("August2025e-statement(2)_0b87d328.pdf", 3, 2025, 8, "Scotia Aero Platinum Mastercard Statement - August 2025"),
    ("September2025e-statement(2)_ccaf3a66.pdf", 3, 2025, 9, "Scotia Aero Platinum Mastercard Statement - September 2025"),
    ("October2025e-statement(2)_a92c4d46.pdf", 3, 2025, 10, "Scotia Aero Platinum Mastercard Statement - October 2025"),
    ("November2025e-statement(2)_76e225da.pdf", 3, 2025, 11, "Scotia Aero Platinum Mastercard Statement - November 2025"),
    ("December2025e-statement(2)_19ca9283.pdf", 3, 2025, 12, "Scotia Aero Platinum Mastercard Statement - December 2025"),
]

# Check financial_documents table schema
cursor.execute("DESCRIBE financial_documents")
cols = [row[0] for row in cursor.fetchall()]
print(f"financial_documents columns: {cols}")

inserted = 0
skipped = 0
for (filename, account_id, year, month, description) in statements:
    s3_url = f"{BASE_URL}/manus-storage/{filename}"
    try:
        s3_key = f"manus-storage/{filename}"
        # Determine vertical based on account
        vertical = "personal"  # bank statements are personal-level
        # Determine currency: Chequing is JMD, credit cards are JMD
        currency = "JMD"
        cursor.execute("""
            INSERT INTO financial_documents (
                householdId, accountId, documentType, description,
                s3Key, s3Url, originalFilename,
                statementYear, statementMonth, vertical, currency,
                taxYear, createdAt
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (
            HOUSEHOLD_ID,
            account_id,
            "bank_statement",
            description,
            s3_key,
            s3_url,
            filename,
            year,
            month,
            vertical,
            currency,
            year,  # taxYear = statement year
        ))
        inserted += 1
    except Exception as e:
        print(f"  Error: {e} | {filename}")
        skipped += 1

conn.commit()
conn.close()
print(f"\n=== DOCUMENTS INSERT DONE ===")
print(f"Inserted: {inserted}")
print(f"Skipped: {skipped}")
