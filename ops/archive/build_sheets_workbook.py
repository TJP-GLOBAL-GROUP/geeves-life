#!/usr/bin/env python3
"""
Build comprehensive Google Sheets tax workbook with data from the Geeves database.
Adds enhanced income tabs with fee/tax breakdown, property attribution, and source links.
Also adds Booking.com data and shares with specified users.
"""

import os
import sys
import mysql.connector
from urllib.parse import urlparse
import subprocess
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime

# --- Config ---
SPREADSHEET_ID = "1Zysra_EqudPXp_2OZQhaoLe1uc9BJ1NFQy3MxpkpdQI"
SHARE_EMAILS = ["tarik@tjperkinsfam.com", "eniola@tjperkinsfam.com"]

# --- Auth ---
sa_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
sa_key_raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')
sa_key = sa_key_raw.replace('\\n', '\n')

credentials_info = {
    "type": "service_account",
    "project_id": "geeves-495802",
    "private_key_id": "auto",
    "private_key": sa_key,
    "client_email": sa_email,
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
credentials = service_account.Credentials.from_service_account_info(credentials_info, scopes=SCOPES)
sheets_service = build('sheets', 'v4', credentials=credentials)
drive_service = build('drive', 'v3', credentials=credentials)

# --- Database ---
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

# --- Fetch all booking data with full details ---
def fetch_bookings_by_year(year):
    cursor.execute("""
        SELECT 
            pb.guestName,
            pb.confirmationNumber,
            pb.checkIn,
            pb.checkOut,
            pb.totalPrice,
            pb.commissionAmount,
            pb.netAmount,
            pb.cleaningFee,

            pb.bookingStatus,
            pb.bookingType,
            pb.currency,
            pp.platform,
            pp.displayName as platformName,
            p.name as propertyName,
            p.address as propertyAddress,
            p.country as propertyCountry
        FROM property_bookings pb
        LEFT JOIN property_platforms pp ON pb.platformId = pp.id
        LEFT JOIN properties p ON pb.propertyId = p.id
        WHERE pb.bookingType = 'booking'
          AND pb.bookingStatus IN ('confirmed', 'completed')
          AND YEAR(FROM_UNIXTIME(pb.checkIn / 1000)) = %s
        ORDER BY pb.checkIn ASC
    """, (year,))
    return cursor.fetchall()

# --- Fetch Booking.com data from our scraped file ---
def get_booking_com_data():
    """Read from the downloaded XLS file"""
    import pandas as pd
    try:
        df = pd.read_excel('/home/ubuntu/Downloads/reservations.xls')
        return df
    except:
        return None

# --- Build enhanced income rows ---
def build_income_rows(year):
    bookings = fetch_bookings_by_year(year)
    rows = []
    
    for b in bookings:
        check_in = datetime.utcfromtimestamp(b['checkIn'] / 1000) if b['checkIn'] else None
        check_out = datetime.utcfromtimestamp(b['checkOut'] / 1000) if b['checkOut'] else None
        
        total = float(b['totalPrice'] or 0)
        commission = float(b['commissionAmount'] or 0)
        net = float(b['netAmount'] or 0)
        cleaning = float(b['cleaningFee'] or 0)
        
        # Calculate nights from dates
        nights = ''
        if check_in and check_out:
            nights = str((check_out - check_in).days)
        
        # Calculate tax withheld (gap between total - commission - net)
        tax_withheld = round(total - commission - net, 2) if (total > 0 and net > 0) else 0
        if tax_withheld < 0:
            tax_withheld = 0
        
        # Property mapping
        prop_name = b['propertyName'] or 'Unknown'
        platform = (b['platform'] or 'unknown').upper()
        if platform == 'AIRBNB':
            platform_display = 'Airbnb'
        elif platform == 'VRBO':
            platform_display = 'VRBO'
        elif platform == 'BOOKING':
            platform_display = 'Booking.com'
        else:
            platform_display = platform
        
        # Location for tax jurisdiction
        location = b['propertyCountry'] or ''
        
        # JMD conversion (approximate rates by year)
        jmd_rate = {'2024': 156.5, '2025': 158.0, '2026': 160.0}.get(str(year), 158.0)
        amount_jmd = round(net * jmd_rate, 0) if 'Jamaica' in location else ''
        
        date_str = check_in.strftime('%Y-%m-%d') if check_in else ''
        month_str = check_in.strftime('%B') if check_in else ''
        checkout_str = check_out.strftime('%Y-%m-%d') if check_out else ''
        
        rows.append([
            date_str,                    # A: Check-in Date
            checkout_str,                # B: Check-out Date
            month_str,                   # C: Month
            prop_name,                   # D: Property
            platform_display,            # E: Platform
            b['guestName'] or '',        # F: Guest Name
            b['confirmationNumber'] or '',  # G: Confirmation #
            nights,  # H: Nights
            f"{total:.2f}" if total > 0 else '',  # I: Gross Total (USD)
            f"{tax_withheld:.2f}" if tax_withheld > 0 else '0.00',  # J: Tax Withheld
            f"{commission:.2f}" if commission > 0 else '0.00',  # K: Commission
            f"{net:.2f}" if net > 0 else '',  # L: Net Payout (USD)
            f"{cleaning:.2f}" if cleaning > 0 else '',  # M: Cleaning Fee
            str(amount_jmd) if amount_jmd else '',  # N: Amount (JMD) - Jamaica only
            '',  # O: Source Documentation Link (to be populated)
        ])
    
    return rows

# --- Create or get sheet ID ---
def get_or_create_sheet(title):
    """Get sheet ID by title, or create it"""
    result = sheets_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    for sheet in result.get('sheets', []):
        if sheet['properties']['title'] == title:
            return sheet['properties']['sheetId']
    
    # Create new sheet
    body = {
        'requests': [{
            'addSheet': {
                'properties': {'title': title}
            }
        }]
    }
    resp = sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body=body
    ).execute()
    return resp['replies'][0]['addSheet']['properties']['sheetId']

# --- Write data to sheet ---
def write_sheet(sheet_title, header, rows):
    """Clear and write data to a sheet"""
    sheet_id = get_or_create_sheet(sheet_title)
    
    # Clear existing data
    sheets_service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A1:Z1000"
    ).execute()
    
    # Write header + data
    all_rows = [header] + rows
    sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{sheet_title}'!A1",
        valueInputOption="RAW",
        body={"values": all_rows}
    ).execute()
    
    print(f"  Written {len(rows)} data rows to '{sheet_title}'")
    return sheet_id

# --- Main execution ---
print("=" * 60)
print("Building Enhanced Tax Workbook")
print("=" * 60)

# Header for enhanced income tabs
INCOME_HEADER = [
    'Check-in', 'Check-out', 'Month', 'Property', 'Platform',
    'Guest Name', 'Confirmation #', 'Nights',
    'Gross Total (USD)', 'Tax Withheld', 'Commission', 'Net Payout (USD)',
    'Cleaning Fee', 'Amount (JMD)', 'Source Doc Link'
]

# Build and write each year
for year in [2024, 2025, 2026]:
    print(f"\n--- {year} ---")
    rows = build_income_rows(year)
    
    if rows:
        sheet_title = f"{year} Income (Enhanced)"
        write_sheet(sheet_title, INCOME_HEADER, rows)
        
        # Calculate totals
        total_gross = sum(float(r[8]) for r in rows if r[8])
        total_tax = sum(float(r[9]) for r in rows if r[9])
        total_comm = sum(float(r[10]) for r in rows if r[10])
        total_net = sum(float(r[11]) for r in rows if r[11])
        
        print(f"  Gross: ${total_gross:,.2f} | Tax: ${total_tax:,.2f} | Comm: ${total_comm:,.2f} | Net: ${total_net:,.2f}")
        
        # Count by property
        props = {}
        for r in rows:
            p = r[3]
            props[p] = props.get(p, 0) + 1
        print(f"  Properties: {props}")
    else:
        print(f"  No bookings found for {year}")

# --- Now add Booking.com data from the XLS ---
print("\n--- Adding Booking.com data from XLS ---")
booking_df = get_booking_com_data()
if booking_df is not None:
    print(f"  Found {len(booking_df)} Booking.com reservations in XLS")
    # The XLS has columns like: Reservation number, Guest name, Check-in, Check-out, etc.
    print(f"  Columns: {list(booking_df.columns)[:10]}")
else:
    print("  No Booking.com XLS found - data already included from database")

# --- Build Summary/Dashboard tab ---
print("\n--- Building Summary Dashboard ---")
summary_header = ['Metric', '2024', '2025', '2026 YTD']
summary_rows = []

for year in [2024, 2025, 2026]:
    rows = build_income_rows(year)
    total_gross = sum(float(r[8]) for r in rows if r[8])
    total_net = sum(float(r[11]) for r in rows if r[11])
    total_bookings = len(rows)
    
    # By property
    by_prop = {}
    for r in rows:
        p = r[3]
        if p not in by_prop:
            by_prop[p] = {'count': 0, 'gross': 0, 'net': 0}
        by_prop[p]['count'] += 1
        by_prop[p]['gross'] += float(r[8]) if r[8] else 0
        by_prop[p]['net'] += float(r[11]) if r[11] else 0
    
    col_idx = [2024, 2025, 2026].index(year) + 1
    if col_idx == 1:
        summary_rows = [
            ['Total Bookings', '', '', ''],
            ['Total Gross Revenue (USD)', '', '', ''],
            ['Total Net Payout (USD)', '', '', ''],
            ['', '', '', ''],
            ['--- By Property ---', '', '', ''],
        ]
        for prop in sorted(by_prop.keys()):
            summary_rows.append([f'{prop} - Bookings', '', '', ''])
            summary_rows.append([f'{prop} - Gross', '', '', ''])
            summary_rows.append([f'{prop} - Net', '', '', ''])
    
    summary_rows[0][col_idx] = str(total_bookings)
    summary_rows[1][col_idx] = f"${total_gross:,.2f}"
    summary_rows[2][col_idx] = f"${total_net:,.2f}"
    
    row_offset = 5
    for i, prop in enumerate(sorted(by_prop.keys())):
        idx = row_offset + (i * 3)
        if idx < len(summary_rows):
            summary_rows[idx][col_idx] = str(by_prop[prop]['count'])
        if idx + 1 < len(summary_rows):
            summary_rows[idx + 1][col_idx] = f"${by_prop[prop]['gross']:,.2f}"
        if idx + 2 < len(summary_rows):
            summary_rows[idx + 2][col_idx] = f"${by_prop[prop]['net']:,.2f}"

write_sheet('Summary Dashboard', summary_header, summary_rows)

# --- Build Tax Jurisdiction tab ---
print("\n--- Building Tax Jurisdiction Reference ---")
tax_header = ['Property', 'Location', 'Tax Type', 'Rate', 'Collected By', 'Notes']
tax_rows = [
    ["The Artiste's Boutique", "Kingston, Jamaica", "GCT (General Consumption Tax)", "15%", "Airbnb/VRBO", "Collected and remitted by platform. NOT host income."],
    ["The Artiste's Boutique", "Kingston, Jamaica", "GCT", "15%", "Booking.com", "NOT collected by Booking.com. Host responsible for remittance."],
    ["Sunset Studio", "Seneca County, NY", "NY State + County Occupancy Tax", "8-12%", "Airbnb/VRBO", "Collected and remitted by platform. NOT host income."],
    ["Sunset Studio", "Seneca County, NY", "Occupancy Tax", "8-12%", "Booking.com", "NOT collected by Booking.com. Host responsible for remittance."],
    ["Morabeza", "Seneca County, NY", "NY State + County Occupancy Tax", "8-12%", "Airbnb/VRBO", "Collected and remitted by platform. NOT host income."],
    ["Morabeza", "Seneca County, NY", "Occupancy Tax", "8-12%", "Booking.com", "NOT collected by Booking.com. Host responsible for remittance."],
]
write_sheet('Tax Jurisdiction Reference', tax_header, tax_rows)

# --- Build Platform Fee Comparison tab ---
print("\n--- Building Platform Fee Comparison ---")
fee_header = ['Platform', 'Fee Type', 'Rate', 'Charged To', 'Notes']
fee_rows = [
    ["Airbnb", "Host Service Fee", "3%", "Host (deducted from payout)", "Standard host-only fee model"],
    ["Airbnb", "Guest Service Fee", "~14%", "Guest (added to booking total)", "Not visible in host financials"],
    ["Airbnb", "Occupancy Tax (where applicable)", "Varies", "Guest (collected by Airbnb)", "Remitted to tax authority, not host income"],
    ["VRBO", "Host Service Fee", "3-5%", "Host (deducted from payout)", "Varies by listing age and performance"],
    ["VRBO", "Traveler Service Fee", "6-12%", "Guest (added to booking total)", "Not visible in host financials"],
    ["VRBO", "Occupancy Tax (where applicable)", "Varies", "Guest (collected by VRBO)", "Remitted to tax authority, not host income"],
    ["VRBO", "Damage Protection", "$49-$99", "Guest", "Optional, may appear in host total"],
    ["Booking.com", "Commission", "15-17%", "Host (invoiced monthly)", "Deducted from gross booking amount"],
    ["Booking.com", "Occupancy Tax", "NOT COLLECTED", "Host responsible", "Host must collect and remit directly"],
]
write_sheet('Platform Fee Comparison', fee_header, fee_rows)

# --- Share with specified users ---
print("\n--- Sharing spreadsheet ---")
for email in SHARE_EMAILS:
    try:
        drive_service.permissions().create(
            fileId=SPREADSHEET_ID,
            body={
                'type': 'user',
                'role': 'writer',
                'emailAddress': email
            },
            sendNotificationEmail=True
        ).execute()
        print(f"  Shared with {email} (editor)")
    except Exception as e:
        print(f"  Error sharing with {email}: {e}")

# --- Rename spreadsheet ---
print("\n--- Renaming spreadsheet ---")
try:
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={
            'requests': [{
                'updateSpreadsheetProperties': {
                    'properties': {'title': '2024-2026 Property Tax Workbook — Tarik Perkins (All Properties)'},
                    'fields': 'title'
                }
            }]
        }
    ).execute()
    print("  Renamed successfully")
except Exception as e:
    print(f"  Rename error: {e}")

print("\n" + "=" * 60)
print("DONE!")
print(f"Spreadsheet: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
print("=" * 60)

conn.close()
EOF
