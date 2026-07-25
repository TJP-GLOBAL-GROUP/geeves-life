#!/usr/bin/env python3
"""Fetch CBNA and PayPal files from Google Drive using service account credentials."""
import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# Build credentials from env
key_str = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY', '').replace('\\n', '\n')
sa_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')

if not key_str or not sa_email:
    print("ERROR: Missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL")
    exit(1)

cred_info = {
    "type": "service_account",
    "project_id": "geeves-495802",
    "private_key": key_str,
    "client_email": sa_email,
    "token_uri": "https://oauth2.googleapis.com/token",
}

credentials = service_account.Credentials.from_service_account_info(
    cred_info,
    scopes=['https://www.googleapis.com/auth/drive.readonly']
)

service = build('drive', 'v3', credentials=credentials)

# Search for CBNA and PayPal files
print("Searching for CBNA and PayPal files...")
queries = [
    "name contains 'CBNA'",
    "name contains 'PayPal'",
    "name contains 'paypal'",
    "name contains 'Capital One'",
    "name contains 'capital one'",
]

all_files = []
for q in queries:
    try:
        results = service.files().list(
            q=q,
            fields="files(id,name,mimeType,modifiedTime,parents)",
            pageSize=50
        ).execute()
        files = results.get('files', [])
        for f in files:
            if f['id'] not in [x['id'] for x in all_files]:
                all_files.append(f)
    except Exception as e:
        print(f"  Query '{q}' failed: {e}")

print(f"\nFound {len(all_files)} files:")
for f in all_files:
    print(f"  {f['name']} ({f['mimeType']}) - Modified: {f.get('modifiedTime', 'unknown')}")
    print(f"    ID: {f['id']}")

# Also search for a folder that might contain these
print("\n\nSearching for folders with statement-related names...")
folder_queries = [
    "name contains 'statement' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'Statement' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'bank' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'Bank' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'tax' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'Tax' and mimeType = 'application/vnd.google-apps.folder'",
    "name contains 'reconcil' and mimeType = 'application/vnd.google-apps.folder'",
]

folders = []
for q in folder_queries:
    try:
        results = service.files().list(q=q, fields="files(id,name)", pageSize=20).execute()
        for f in results.get('files', []):
            if f['id'] not in [x['id'] for x in folders]:
                folders.append(f)
    except Exception as e:
        pass

if folders:
    print(f"Found {len(folders)} relevant folders:")
    for f in folders:
        print(f"  {f['name']} (ID: {f['id']})")
else:
    print("No relevant folders found")

# Check recently modified files (last 24 hours) - user said they just uploaded
from datetime import datetime, timedelta
recent_time = (datetime.utcnow() - timedelta(hours=48)).isoformat() + 'Z'
try:
    results = service.files().list(
        q=f"modifiedTime > '{recent_time}' and mimeType != 'application/vnd.google-apps.folder'",
        fields="files(id,name,mimeType,modifiedTime,parents)",
        orderBy="modifiedTime desc",
        pageSize=30
    ).execute()
    recent_files = results.get('files', [])
    print(f"\n\nRecently modified files (last 48h): {len(recent_files)}")
    for f in recent_files:
        print(f"  {f.get('modifiedTime', '')[:16]} | {f['name']} ({f['mimeType'][:40]})")
except Exception as e:
    print(f"Recent files query failed: {e}")
