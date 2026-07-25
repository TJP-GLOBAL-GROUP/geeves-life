import mysql.connector
from urllib.parse import urlparse

db_url = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
p = urlparse(db_url)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# Get oauth_tokens columns first
cur.execute("SHOW COLUMNS FROM oauth_tokens")
cols = [row['Field'] for row in cur.fetchall()]
print(f"oauth_tokens columns: {cols}")

# Check all Google OAuth tokens
print("\n=== GOOGLE OAUTH TOKENS ===")
cur.execute("""
    SELECT id, memberId, provider, accountEmail, scopes, status, 
           expiresAt, lastRefreshedAt, updatedAt
    FROM oauth_tokens 
    WHERE provider = 'google'
    ORDER BY updatedAt DESC
""")
for row in cur.fetchall():
    print(f"\n  ID: {row['id']}")
    print(f"  Email: {row['accountEmail']}")
    print(f"  Status: {row['status']}")
    print(f"  Scopes: {(row['scopes'] or '')[:120]}")
    print(f"  ExpiresAt: {row['expiresAt']}")
    print(f"  LastRefreshed: {row['lastRefreshedAt']}")
    print(f"  Updated: {row['updatedAt']}")

# Check property_email_tokens
print("\n\n=== PROPERTY EMAIL TOKENS ===")
cur.execute("SELECT id, propertyId, emailAddress, provider, tokenExpiry, lastUsedAt, updatedAt FROM property_email_tokens")
for row in cur.fetchall():
    print(f"\n  ID: {row['id']}")
    print(f"  Email: {row['emailAddress']}")
    print(f"  Property: {row['propertyId']}")
    print(f"  Expiry: {row['tokenExpiry']}")
    print(f"  LastUsed: {row['lastUsedAt']}")
    print(f"  Updated: {row['updatedAt']}")

# Check what tables relate to the Accounts page on the dashboard
print("\n\n=== DASHBOARD ACCOUNTS PAGE ===")
# Look at the Accounts page router
import subprocess
result = subprocess.run(['grep', '-rn', 'accounts\|Accounts', 'client/src/pages/', '--include=*.tsx'], 
                      capture_output=True, text=True, cwd='/home/ubuntu/geeves-shopping')
print("Files referencing 'accounts':")
for line in result.stdout.strip().split('\n')[:15]:
    print(f"  {line}")

# Check the router for accounts
result = subprocess.run(['grep', '-n', 'account\|Account\|integration\|Integration', 'client/src/App.tsx'], 
                      capture_output=True, text=True, cwd='/home/ubuntu/geeves-shopping')
print("\nApp.tsx routes for accounts/integrations:")
for line in result.stdout.strip().split('\n')[:10]:
    print(f"  {line}")

# Check what the Accounts page actually queries
result = subprocess.run(['bash', '-c', 'ls client/src/pages/Accounts* client/src/pages/accounts* 2>/dev/null'], 
                      capture_output=True, text=True, cwd='/home/ubuntu/geeves-shopping')
print(f"\nAccount page files: {result.stdout.strip()}")

conn.close()
