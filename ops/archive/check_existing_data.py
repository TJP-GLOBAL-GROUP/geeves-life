import mysql.connector
from urllib.parse import urlparse, parse_qs

db_url = "mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={\"rejectUnauthorized\":true}"
p = urlparse(db_url)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor()

# Check existing orders data
cur.execute("SELECT COUNT(*) FROM orders")
print(f"Existing orders: {cur.fetchone()[0]}")

cur.execute("SELECT platform, COUNT(*), MIN(orderDate), MAX(orderDate) FROM orders GROUP BY platform")
print("\nOrders by platform:")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} orders ({row[2]} to {row[3]})")

# Check existing property expense records
cur.execute("SELECT COUNT(*) FROM property_expense_records")
print(f"\nExisting property expense records: {cur.fetchone()[0]}")

cur.execute("SELECT property, category, COUNT(*), SUM(amountJMD) FROM property_expense_records GROUP BY property, category ORDER BY property, category")
print("\nExpense records by property/category:")
for row in cur.fetchall():
    print(f"  {row[0]} / {row[1]}: {row[2]} records, JMD {row[3]}")

# Find email-related tables
cur.execute("SHOW TABLES LIKE '%email%'")
print("\nEmail-related tables:")
email_tables = [row[0] for row in cur.fetchall()]
for t in email_tables:
    print(f"  {t}")

cur.execute("SHOW TABLES LIKE '%scrape%'")
print("\nScrape-related tables:")
for row in cur.fetchall():
    print(f"  {row[0]}")

cur.execute("SHOW TABLES LIKE '%gmail%'")
print("\nGmail-related tables:")
for row in cur.fetchall():
    print(f"  {row[0]}")

# Try to find the right email table and check for vendor emails
for table in email_tables:
    cur.execute(f"SHOW COLUMNS FROM `{table}`")
    cols = [row[0] for row in cur.fetchall()]
    print(f"\n  Columns in {table}: {cols[:15]}")
    
    # Find subject/from columns
    subject_col = next((c for c in cols if 'subject' in c.lower()), None)
    from_col = next((c for c in cols if 'from' in c.lower()), None)
    date_col = next((c for c in cols if 'date' in c.lower() or 'received' in c.lower() or 'created' in c.lower()), None)
    
    if subject_col:
        print(f"\n  Checking {table} for vendor emails (subject col: {subject_col}, from col: {from_col})...")
        vendors = ['amazon', 'walmart', 'wayfair', 'home depot', 'lowes', "lowe's"]
        for v in vendors:
            query = f"SELECT COUNT(*) FROM `{table}` WHERE LOWER(`{subject_col}`) LIKE '%{v}%'"
            if from_col:
                query += f" OR LOWER(`{from_col}`) LIKE '%{v}%'"
            cur.execute(query)
            count = cur.fetchone()[0]
            print(f"    {v}: {count} emails")
        
        if date_col:
            cur.execute(f"SELECT MIN(`{date_col}`), MAX(`{date_col}`), COUNT(*) FROM `{table}`")
            row = cur.fetchone()
            print(f"\n  Total records in {table}: {row[2]} (from {row[0]} to {row[1]})")


conn.close()
