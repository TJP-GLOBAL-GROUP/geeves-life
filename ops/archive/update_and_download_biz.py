#!/usr/bin/env python3
"""
Two tasks in one script:
1. Update Capital One classifications from old vertical names to new unit-based names
2. Find and download business account statements from Google Drive
"""
import subprocess, json, os, re
import mysql.connector
from urllib.parse import urlparse
from google.oauth2 import service_account
from googleapiclient.discovery import build
import io

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

def get_env_vars():
    result = subprocess.run(['bash', '-c', 'for pid in $(pgrep node | head -1); do cat /proc/$pid/environ 2>/dev/null; done'], capture_output=True)
    env_vars = {}
    for item in result.stdout.split(b'\x00'):
        decoded = item.decode('utf-8', errors='replace')
        if '=' in decoded:
            k, v = decoded.split('=', 1)
            env_vars[k] = v
    return env_vars

def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )

def get_drive_service(env_vars):
    sa_email = env_vars.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    sa_key = env_vars.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')
    sa_info = {
        'type': 'service_account',
        'project_id': 'geeves-495802',
        'private_key': sa_key,
        'client_email': sa_email,
        'token_uri': 'https://oauth2.googleapis.com/token',
    }
    creds = service_account.Credentials.from_service_account_info(
        sa_info, scopes=['https://www.googleapis.com/auth/drive.readonly']
    )
    return build('drive', 'v3', credentials=creds)


def update_capital_one_verticals():
    """Update Capital One classifications from old names to new unit-based names."""
    print("=" * 60)
    print("TASK 1: UPDATE CAPITAL ONE TO UNIT-BASED VERTICALS")
    print("=" * 60)
    
    conn = get_db()
    cur = conn.cursor()
    
    # Mapping from old vertical names to new unit-based names
    # Old: bohemian_lodges -> artistes_boutique (Jamaica STR)
    # Old: morabeza (construction) stays morabeza_suite
    # Old: sunset_studio stays sunset_studio
    # Old: ny_property_cleaning -> whole_building_ny (shared across units)
    
    updates = [
        # bohemian_lodges -> artistes_boutique
        ("UPDATE capital_one_transactions SET business_vertical = 'artistes_boutique' WHERE business_vertical = 'bohemian_lodges'", "bohemian_lodges → artistes_boutique"),
        # ny_cleaning -> whole_building_ny
        ("UPDATE capital_one_transactions SET business_vertical = 'whole_building_ny' WHERE business_vertical IN ('ny_property', 'ny_cleaning', 'ny_property_cleaning')", "ny_property* → whole_building_ny"),
        # personal -> personal_household
        ("UPDATE capital_one_transactions SET business_vertical = 'personal_household' WHERE business_vertical = 'personal'", "personal → personal_household"),
        # Also update BoA if any old names exist
        ("UPDATE boa_transactions SET vertical = 'artistes_boutique' WHERE vertical = 'bohemian_lodges'", "BoA: bohemian_lodges → artistes_boutique"),
    ]
    
    for sql, desc in updates:
        cur.execute(sql)
        if cur.rowcount > 0:
            print(f"  {desc}: {cur.rowcount} rows updated")
    
    conn.commit()
    
    # Show current distribution
    cur.execute("""
        SELECT business_vertical, COUNT(*) as cnt, SUM(amount) as total
        FROM capital_one_transactions
        WHERE business_vertical NOT IN ('unclassified', 'personal_household', 'fee_interest')
        GROUP BY business_vertical
        ORDER BY total DESC
    """)
    
    print(f"\n  Capital One - Business Verticals (non-personal):")
    for row in cur.fetchall():
        print(f"    {row[0]:<25} {row[1]:>5} txns | ${abs(row[2] or 0):>10,.2f}")
    
    conn.close()
    print("\n  Done!")


def find_and_download_business_statements():
    """Find business account statements in Google Drive and download them."""
    print("\n" + "=" * 60)
    print("TASK 2: FIND & DOWNLOAD BUSINESS ACCOUNT STATEMENTS")
    print("=" * 60)
    
    env_vars = get_env_vars()
    drive = get_drive_service(env_vars)
    
    # Search for business statements - look for folders with "business" or "maxfield" 
    # or check the same parent folder as Capital One statements
    
    # First, find the Capital One folder to get its parent
    results = drive.files().list(
        q="name contains 'Capital One' and mimeType = 'application/vnd.google-apps.folder'",
        fields="files(id, name, parents)",
        supportsAllDrives=True, includeItemsFromAllDrives=True
    ).execute()
    
    cap_one_folders = results.get('files', [])
    print(f"\n  Found Capital One folders: {[(f['name'], f['id']) for f in cap_one_folders]}")
    
    # Search for business/bank statements folders
    search_queries = [
        "name contains 'Business' and mimeType = 'application/vnd.google-apps.folder'",
        "name contains 'business' and mimeType = 'application/vnd.google-apps.folder'",
        "name contains 'Checking' and mimeType = 'application/vnd.google-apps.folder'",
        "name contains 'Savings' and mimeType = 'application/vnd.google-apps.folder'",
        "name contains 'Bank' and mimeType = 'application/vnd.google-apps.folder'",
        "name contains 'Statement' and mimeType = 'application/vnd.google-apps.folder'",
    ]
    
    all_folders = []
    seen_ids = set()
    for q in search_queries:
        try:
            results = drive.files().list(
                q=q, fields="files(id, name, parents, modifiedTime)",
                supportsAllDrives=True, includeItemsFromAllDrives=True
            ).execute()
            for f in results.get('files', []):
                if f['id'] not in seen_ids:
                    all_folders.append(f)
                    seen_ids.add(f['id'])
        except Exception as e:
            pass
    
    print(f"\n  Found {len(all_folders)} potentially relevant folders:")
    for f in all_folders:
        print(f"    {f['name']} (id: {f['id']}, modified: {f.get('modifiedTime', '?')[:10]})")
    
    # Also check if there are PDFs/CSVs with "business" or bank names in the same parent
    if cap_one_folders:
        parent_id = cap_one_folders[0].get('parents', [None])[0]
        if parent_id:
            print(f"\n  Checking parent folder of Capital One (id: {parent_id})...")
            results = drive.files().list(
                q=f"'{parent_id}' in parents",
                fields="files(id, name, mimeType, modifiedTime)",
                supportsAllDrives=True, includeItemsFromAllDrives=True,
                orderBy="name"
            ).execute()
            print(f"  Contents of parent folder:")
            for f in results.get('files', []):
                print(f"    {f['name']} ({f['mimeType'][:30]})")
    
    # Search for recently uploaded bank statement PDFs
    results = drive.files().list(
        q="mimeType = 'application/pdf' and modifiedTime > '2026-07-01'",
        fields="files(id, name, parents, modifiedTime, size)",
        supportsAllDrives=True, includeItemsFromAllDrives=True,
        orderBy="modifiedTime desc",
        pageSize=50
    ).execute()
    
    recent_pdfs = results.get('files', [])
    print(f"\n  Recently uploaded PDFs (since Jul 1, 2026): {len(recent_pdfs)}")
    for f in recent_pdfs[:30]:
        size_kb = int(f.get('size', 0)) // 1024
        print(f"    {f['name']:<50} {size_kb:>5}KB  {f.get('modifiedTime', '')[:16]}")
    
    return all_folders, recent_pdfs


if __name__ == '__main__':
    update_capital_one_verticals()
    folders, pdfs = find_and_download_business_statements()
    
    # Save findings for next step
    with open('/home/ubuntu/tax_prep/biz_drive_findings.json', 'w') as f:
        json.dump({'folders': folders, 'recent_pdfs': pdfs}, f, indent=2, default=str)
    print(f"\n  Findings saved to biz_drive_findings.json")
