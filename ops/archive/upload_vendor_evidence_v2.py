"""
Upload vendor evidence documents to S3 using manus-upload-file --webdev
and insert records into financial_documents table.
"""
import os
import json
import subprocess
import re
import mysql.connector
from pathlib import Path

MANIFEST_PATH = '/home/ubuntu/upload/vendor_evidence_manifest.json'

# DB connection
db_url = os.environ.get('DATABASE_URL', '')
# Parse mysql://user:pass@host:port/dbname
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
if not m:
    print(f"Could not parse DATABASE_URL: {db_url[:50]}...")
    exit(1)

db_user, db_pass, db_host, db_port, db_name_raw = m.groups()
# Strip SSL params from db name (e.g. dbname?ssl={...})
db_name = db_name_raw.split('?')[0]
conn = mysql.connector.connect(
    host=db_host, port=int(db_port),
    user=db_user, password=db_pass,
    database=db_name, ssl_disabled=False,
    connection_timeout=10
)
cursor = conn.cursor(dictionary=True)

VERTICAL = 'artistes_boutique'

# Check existing docs
cursor.execute(
    "SELECT s3Url FROM financial_documents WHERE vertical = %s AND documentType IN ('vendor_bill', 'vendor_receipt')",
    (VERTICAL,)
)
existing = {row['s3Url'] for row in cursor.fetchall() if row['s3Url']}
print(f"Already have {len(existing)} vendor docs in DB")

# Load manifest
with open(MANIFEST_PATH) as f:
    manifest = json.load(f)

print(f"Processing {len(manifest)} documents...")

uploaded = 0
inserted = 0
skipped = 0
updated_manifest = []

# Process in batches of 10 to avoid command line length limits
batch_size = 10
pending = [e for e in manifest if not e.get('s3_url') and Path(e['local_file']).exists()]
already_done = [e for e in manifest if e.get('s3_url') or not Path(e['local_file']).exists()]

print(f"  {len(pending)} to upload, {len(already_done)} already done/missing")

for i in range(0, len(pending), batch_size):
    batch = pending[i:i+batch_size]
    files = [e['local_file'] for e in batch]
    
    # Upload batch
    cmd = ['manus-upload-file', '--webdev'] + files
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        output = result.stdout + result.stderr
        
        # Parse URLs from output - format: "[OK] /path/to/file: https://..."
        url_map = {}
        for line in output.split('\n'):
            m = re.match(r'\[OK\]\s+(.+?):\s+(https://\S+)', line)
            if m:
                url_map[m.group(1)] = m.group(2)
        
        for entry in batch:
            url = url_map.get(entry['local_file'], '')
            if url:
                entry['s3_url'] = url
                uploaded += 1
                print(f"  ✓ {Path(entry['local_file']).name} → {url[:60]}...")
            else:
                print(f"  ✗ No URL for {Path(entry['local_file']).name}")
    except subprocess.TimeoutExpired:
        print(f"  ✗ Batch timeout")
    except Exception as e:
        print(f"  ✗ Batch error: {e}")

# Now insert all with URLs into DB
all_docs = already_done + pending
for entry in all_docs:
    s3_url = entry.get('s3_url', '')
    if not s3_url or s3_url in existing:
        if s3_url in existing:
            skipped += 1
        updated_manifest.append(entry)
        continue
    
    doc_type = 'vendor_bill' if entry['doc_type'] == 'bill' else 'vendor_receipt'
    doc_date = None
    try:
        from datetime import datetime
        doc_date = int(datetime.strptime(entry['date'], '%Y-%m-%d').timestamp() * 1000)
    except:
        doc_date = None
    
    try:
        cursor.execute("""
            INSERT INTO financial_documents 
            (vertical, documentType, documentDate, description, s3Url, originalFilename, 
             statementYear, currency, taxYear, createdAt, updatedAt)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
        """, (
            VERTICAL,
            doc_type,
            doc_date,
            f"{entry['vendor']} - {entry['doc_type']} - {entry['date']} - {entry['category']}",
            s3_url,
            Path(entry['local_file']).name,
            entry['year'],
            entry.get('currency', 'JMD'),
            entry['year'],
        ))
        conn.commit()
        inserted += 1
        existing.add(s3_url)
    except Exception as e:
        print(f"  ✗ DB error for {entry['vendor']}: {str(e)[:100]}")
    
    updated_manifest.append(entry)

# Save updated manifest
with open(MANIFEST_PATH, 'w') as f:
    json.dump(updated_manifest, f, indent=2)

cursor.close()
conn.close()

print(f"\n=== VENDOR EVIDENCE UPLOAD SUMMARY ===")
print(f"Uploaded to S3: {uploaded}")
print(f"Inserted to DB: {inserted}")
print(f"Skipped (already done): {skipped}")
print(f"Total: {len(manifest)}")

# Summary by vendor
from collections import Counter
vendor_counts = Counter(e['vendor'] for e in updated_manifest if e.get('s3_url'))
print("\nDocs with S3 URLs by vendor:")
for v, c in vendor_counts.most_common():
    print(f"  {v}: {c}")
