#!/usr/bin/env python3
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build

sa_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
sa_key_raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')
sa_key = sa_key_raw.replace('\\n', '\n')

credentials_info = {
    'type': 'service_account',
    'project_id': 'geeves-495802',
    'private_key_id': 'auto',
    'private_key': sa_key,
    'client_email': sa_email,
    'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
    'token_uri': 'https://oauth2.googleapis.com/token',
}

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
credentials = service_account.Credentials.from_service_account_info(credentials_info, scopes=SCOPES)
sheets_service = build('sheets', 'v4', credentials=credentials)

spreadsheet_id = '1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI'

# Check the summary dashboard
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=spreadsheet_id,
    range="'Summary Dashboard'!A1:D20"
).execute()
values = result.get('values', [])
print('=== Summary Dashboard ===')
for row in values:
    print(f'  {row}')

# Check 2025 Enhanced tab platform breakdown
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=spreadsheet_id,
    range="'2025 Income (Enhanced)'!E2:E200"
).execute()
values = result.get('values', [])
platforms = {}
for row in values:
    if row:
        p = row[0]
        platforms[p] = platforms.get(p, 0) + 1
print(f'\n=== 2025 Income (Enhanced) - Platform breakdown ===')
print(f'  Total rows: {len(values)}')
print(f'  Platforms: {platforms}')

# Check 2024 Enhanced tab platform breakdown
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=spreadsheet_id,
    range="'2024 Income (Enhanced)'!E2:E200"
).execute()
values = result.get('values', [])
platforms = {}
for row in values:
    if row:
        p = row[0]
        platforms[p] = platforms.get(p, 0) + 1
print(f'\n=== 2024 Income (Enhanced) - Platform breakdown ===')
print(f'  Total rows: {len(values)}')
print(f'  Platforms: {platforms}')

# Check 2026 Enhanced tab platform breakdown
result = sheets_service.spreadsheets().values().get(
    spreadsheetId=spreadsheet_id,
    range="'2026 Income (Enhanced)'!E2:E200"
).execute()
values = result.get('values', [])
platforms = {}
for row in values:
    if row:
        p = row[0]
        platforms[p] = platforms.get(p, 0) + 1
print(f'\n=== 2026 Income (Enhanced) - Platform breakdown ===')
print(f'  Total rows: {len(values)}')
print(f'  Platforms: {platforms}')
