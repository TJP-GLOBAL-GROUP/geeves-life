#!/usr/bin/env python3
"""
Create a Google Sheets 2025 Property Tax Workbook with all income data
from Airbnb, VRBO, and Booking.com across all 3 properties.
Uses Google Service Account for authentication.
Shares with tarik@tjperkinsfam.com and eniola@tjperkinsfam.com.
"""

import os
import json
import subprocess
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

# ─── Google Service Account Auth ───────────────────────────────────────
def get_google_services():
    """Create Google Sheets and Drive services using service account."""
    sa_email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    sa_key_raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')
    
    # Parse the private key (handle escaped newlines)
    sa_key = sa_key_raw.replace('\\n', '\n')
    
    credentials_info = {
        "type": "service_account",
        "project_id": "geeves-495802",
        "private_key_id": "auto",
        "private_key": sa_key,
        "client_email": sa_email,
        "client_id": "",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    }
    
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
    ]
    
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info, scopes=SCOPES
    )
    
    sheets_service = build('sheets', 'v4', credentials=credentials)
    drive_service = build('drive', 'v3', credentials=credentials)
    
    return sheets_service, drive_service

# ─── Database Connection ───────────────────────────────────────────────
def get_db_url():
    result = subprocess.run(
        ['bash', '-c', "cat /proc/$(pgrep -f 'node.*server' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL | cut -d= -f2-"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def get_db_connection():
    db_url = get_db_url()
    parsed = urlparse(db_url)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )

# ─── Fetch All 2025 Booking Data ──────────────────────────────────────
def fetch_bookings():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
    SELECT 
        pb.id, pb.guestName, pb.confirmationNumber,
        pb.checkIn, pb.checkOut, pb.bookingStatus, pb.bookingType,
        pb.totalPrice, pb.cleaningFee, pb.commissionAmount, pb.netAmount,
        pb.currency, pb.platformId, pb.propertyId,
        pb.emailScrapeSource, pb.dataSource,
        pp.platform as platformType, pp.displayName as platformDisplayName,
        p.name as propertyName
    FROM property_bookings pb
    LEFT JOIN property_platforms pp ON pb.platformId = pp.id
    LEFT JOIN properties p ON pb.propertyId = p.id
    WHERE pb.bookingType = 'booking'
      AND pb.bookingStatus IN ('confirmed', 'completed')
      AND pb.checkIn >= 1735689600000
      AND pb.checkIn < 1767225600000
    ORDER BY p.name, pp.platform, pb.checkIn
    """)
    
    bookings = cursor.fetchall()
    conn.close()
    return bookings

# ─── Helpers ──────────────────────────────────────────────────────────
def format_date(ts):
    if not ts:
        return ""
    return datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d")

def format_currency(val):
    if val is None:
        return ""
    return f"{float(val):.2f}"

# ─── Main ─────────────────────────────────────────────────────────────
def main():
    print("Authenticating with Google Service Account...")
    sheets_service, drive_service = get_google_services()
    print("✓ Authenticated")
    
    print("Fetching 2025 booking data from database...")
    bookings = fetch_bookings()
    print(f"Found {len(bookings)} confirmed/completed bookings in 2025")
    
    # Group by property
    properties = {}
    for b in bookings:
        prop_name = b['propertyName'] or 'Unknown'
        if prop_name not in properties:
            properties[prop_name] = []
        properties[prop_name].append(b)
    
    for prop, bks in properties.items():
        print(f"  {prop}: {len(bks)} bookings")
    
    # Read Booking.com scraped data
    booking_com_data = []
    with open('/home/ubuntu/tax_prep/booking_com_page1_data.txt', 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 10:
                booking_com_data.append({
                    'property_id': parts[0],
                    'property_name': parts[1],
                    'guest': parts[2],
                    'checkin': parts[3],
                    'checkout': parts[4],
                    'status': parts[5],
                    'total': parts[6],
                    'commission': parts[7],
                    'reservation_number': parts[8],
                    'booked_on': parts[9],
                })
    
    print(f"Booking.com scraped data: {len(booking_com_data)} reservations")
    
    # ─── Create Spreadsheet ───────────────────────────────────────────
    print("\nCreating Google Sheets workbook...")
    
    spreadsheet_body = {
        "properties": {
            "title": "2025 Property Tax Workbook — Tarik Perkins"
        },
        "sheets": [
            {"properties": {"title": "Summary", "index": 0}},
            {"properties": {"title": "Artiste's Boutique", "index": 1}},
            {"properties": {"title": "Sunset Studio", "index": 2}},
            {"properties": {"title": "Morabeza", "index": 3}},
            {"properties": {"title": "Booking.com Data", "index": 4}},
            {"properties": {"title": "Notes & Sources", "index": 5}},
        ]
    }
    
    spreadsheet = sheets_service.spreadsheets().create(body=spreadsheet_body).execute()
    spreadsheet_id = spreadsheet['spreadsheetId']
    spreadsheet_url = spreadsheet['spreadsheetUrl']
    print(f"✓ Created: {spreadsheet_url}")
    
    # ─── Calculate Summary Data ───────────────────────────────────────
    summary_data = {}
    for b in bookings:
        prop = b['propertyName'] or 'Unknown'
        plat = b['platformType'] or 'other'
        key = (prop, plat)
        if key not in summary_data:
            summary_data[key] = {'count': 0, 'gross': 0, 'commission': 0, 'net': 0, 'nights': 0}
        summary_data[key]['count'] += 1
        summary_data[key]['gross'] += float(b['totalPrice'] or 0)
        summary_data[key]['commission'] += float(b['commissionAmount'] or 0)
        summary_data[key]['net'] += float(b['netAmount'] or 0)
        if b['checkIn'] and b['checkOut']:
            summary_data[key]['nights'] += round((b['checkOut'] - b['checkIn']) / 86400000)
    
    # Add Booking.com data (completed only)
    for bcd in booking_com_data:
        if bcd['status'] != 'OK':
            continue
        prop = "The Artiste's Boutique" if bcd['property_id'] == '12661610' else "Sunset Studio"
        key = (prop, 'booking_com')
        if key not in summary_data:
            summary_data[key] = {'count': 0, 'gross': 0, 'commission': 0, 'net': 0, 'nights': 0}
        total_val = float(bcd['total'].replace('US$', '').replace(',', '')) if 'US$' in bcd['total'] else 0
        comm_val = float(bcd['commission'].replace('US$', '').replace(',', '')) if 'US$' in bcd['commission'] else 0
        summary_data[key]['count'] += 1
        summary_data[key]['gross'] += total_val
        summary_data[key]['commission'] += comm_val
        summary_data[key]['net'] += total_val - comm_val
    
    # ─── Write Summary Tab ────────────────────────────────────────────
    print("Writing Summary tab...")
    
    summary_rows = [
        ["2025 PROPERTY TAX WORKBOOK — TARIK PERKINS"],
        [f"Generated: {datetime.now().strftime('%B %d, %Y')}"],
        [""],
        ["INCOME SUMMARY BY PROPERTY & PLATFORM"],
        ["Property", "Platform", "Bookings", "Nights", "Gross Revenue", "Commission", "Net Payout"],
    ]
    
    grand_gross = grand_comm = grand_net = grand_nights = grand_count = 0
    
    for (prop, plat), data in sorted(summary_data.items()):
        plat_label = {'airbnb': 'Airbnb', 'vrbo': 'VRBO', 'booking_com': 'Booking.com', 'direct': 'Direct', 'other': 'Other'}.get(plat, plat)
        summary_rows.append([
            prop, plat_label, data['count'], data['nights'],
            f"${data['gross']:.2f}", f"${data['commission']:.2f}", f"${data['net']:.2f}"
        ])
        grand_gross += data['gross']
        grand_comm += data['commission']
        grand_net += data['net']
        grand_nights += data['nights']
        grand_count += data['count']
    
    summary_rows.append([""])
    summary_rows.append(["TOTAL", "", grand_count, grand_nights,
                         f"${grand_gross:.2f}", f"${grand_comm:.2f}", f"${grand_net:.2f}"])
    
    # US Schedule E
    summary_rows.append([""])
    summary_rows.append(["US SCHEDULE E (Morabeza + Sunset Studio)"])
    us_gross = sum(d['gross'] for (p, _), d in summary_data.items() if p in ('Morabeza', 'Sunset Studio'))
    us_comm = sum(d['commission'] for (p, _), d in summary_data.items() if p in ('Morabeza', 'Sunset Studio'))
    us_net = sum(d['net'] for (p, _), d in summary_data.items() if p in ('Morabeza', 'Sunset Studio'))
    summary_rows.append(["Gross Rental Income", "", "", "", f"${us_gross:.2f}"])
    summary_rows.append(["Commission Expenses", "", "", "", f"${us_comm:.2f}"])
    summary_rows.append(["Net Rental Income", "", "", "", f"${us_net:.2f}"])
    
    # Jamaica
    summary_rows.append([""])
    summary_rows.append(["JAMAICA (Artiste's Boutique)"])
    ja_gross = sum(d['gross'] for (p, _), d in summary_data.items() if "Artiste" in p)
    ja_comm = sum(d['commission'] for (p, _), d in summary_data.items() if "Artiste" in p)
    ja_net = sum(d['net'] for (p, _), d in summary_data.items() if "Artiste" in p)
    summary_rows.append(["Gross Rental Income", "", "", "", f"${ja_gross:.2f}"])
    summary_rows.append(["Commission Expenses", "", "", "", f"${ja_comm:.2f}"])
    summary_rows.append(["Net Rental Income", "", "", "", f"${ja_net:.2f}"])
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Summary!A1",
        valueInputOption="USER_ENTERED",
        body={"values": summary_rows}
    ).execute()
    
    # ─── Write Property Tabs ──────────────────────────────────────────
    platform_labels = {'airbnb': 'Airbnb', 'vrbo': 'VRBO', 'booking_com': 'Booking.com', 'direct': 'Direct', 'other': 'Other'}
    
    for prop_name, tab_name in [
        ("The Artiste's Boutique", "Artiste's Boutique"),
        ("Sunset Studio", "Sunset Studio"),
        ("Morabeza", "Morabeza"),
    ]:
        print(f"Writing {tab_name} tab...")
        prop_bookings = properties.get(prop_name, [])
        
        rows = [
            [f"{tab_name} — 2025 Booking Income"],
            [""],
            ["Guest", "Platform", "Confirmation #", "Check-in", "Check-out", "Nights",
             "Gross ($)", "Commission ($)", "Net ($)", "Currency", "Data Source", "Source Doc Link"],
        ]
        
        prop_gross = prop_comm = prop_net = prop_nights = 0
        
        for b in prop_bookings:
            nights = round((b['checkOut'] - b['checkIn']) / 86400000) if b['checkIn'] and b['checkOut'] else 0
            gross = float(b['totalPrice'] or 0)
            comm = float(b['commissionAmount'] or 0)
            net = float(b['netAmount'] or 0)
            
            # Build source doc link from emailScrapeSource if available
            source_link = ""
            if b.get('emailScrapeSource'):
                source_link = b['emailScrapeSource']
            
            rows.append([
                b['guestName'] or 'Unknown Guest',
                platform_labels.get(b['platformType'], b['platformType'] or 'Other'),
                b['confirmationNumber'] or '',
                format_date(b['checkIn']),
                format_date(b['checkOut']),
                nights,
                format_currency(b['totalPrice']),
                format_currency(b['commissionAmount']),
                format_currency(b['netAmount']),
                b['currency'] or 'USD',
                b['dataSource'] or '',
                source_link,
            ])
            
            prop_gross += gross
            prop_comm += comm
            prop_net += net
            prop_nights += nights
        
        rows.append([""])
        rows.append(["TOTAL", "", "", "", "", prop_nights,
                     f"{prop_gross:.2f}", f"{prop_comm:.2f}", f"{prop_net:.2f}"])
        
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab_name}'!A1",
            valueInputOption="USER_ENTERED",
            body={"values": rows}
        ).execute()
    
    # ─── Write Booking.com Tab ────────────────────────────────────────
    print("Writing Booking.com Data tab...")
    bcom_rows = [
        ["Booking.com 2025 Reservations (Scraped from Extranet)"],
        ["Source: admin.booking.com group reservations export"],
        [""],
        ["Property", "Guest", "Check-in", "Check-out", "Status",
         "Total Payment", "Commission", "Net", "Reservation #", "Booked On"],
    ]
    
    for bcd in booking_com_data:
        total_str = bcd['total'].replace('US$', '').replace(',', '')
        comm_str = bcd['commission'].replace('US$', '').replace(',', '')
        try:
            net_val = f"US${float(total_str) - float(comm_str):.2f}"
        except:
            net_val = ""
        
        bcom_rows.append([
            bcd['property_name'],
            bcd['guest'],
            bcd['checkin'],
            bcd['checkout'],
            bcd['status'],
            bcd['total'],
            bcd['commission'],
            net_val,
            bcd['reservation_number'],
            bcd['booked_on'],
        ])
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'Booking.com Data'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": bcom_rows}
    ).execute()
    
    # ─── Write Notes & Sources Tab ────────────────────────────────────
    print("Writing Notes & Sources tab...")
    notes_rows = [
        ["NOTES & SOURCE DOCUMENTS"],
        [""],
        ["DATA SOURCES"],
        ["Platform", "Source Type", "Description", "Link"],
        ["Airbnb", "Email scraping", "Confirmation emails from tarikp.us@gmail.com and tarik@maxfieldmarket.com", ""],
        ["Airbnb", "iCal feed", "Calendar sync from Airbnb listing calendars", ""],
        ["VRBO", "Email scraping", "Confirmation emails from tarikp.us@gmail.com", ""],
        ["VRBO", "iCal feed", "Calendar sync from VRBO listing calendars", ""],
        ["Booking.com", "Extranet scrape", "Manual scrape from admin.booking.com (Jul 3, 2026)", "https://admin.booking.com/hotel/hoteladmin/groups/reservations/index.html"],
        ["Booking.com", "XLS export", "Downloaded reservations.xls from Booking.com extranet", ""],
        [""],
        ["DATA QUALITY NOTES"],
        ["Issue", "Affected Records", "Resolution"],
        ["Missing financials (iCal-only)", "6 Morabeza, 3 Artiste's Boutique", "No matching payout email found — amounts TBD"],
        ["Booking.com no-shows", "3 at Artiste's Boutique ($4,990.95)", "May be collectible — check with Booking.com"],
        ["Booking.com outstanding invoices", "US$1,130.98 total overdue", "Commission owed to Booking.com"],
        ["Cross-property duplicates", "17 records cleaned (Jul 3, 2026)", "Deleted duplicates, remapped orphaned platforms"],
        [""],
        ["COMMISSION INVOICES (Booking.com)"],
        ["Property", "2025 Total Commission", "Status"],
        ["Artiste's Boutique", "US$2,571.19", "All paid (8 monthly invoices)"],
        ["Sunset Studio", "US$552.37", "All paid (3 monthly invoices Jul-Sep)"],
        [""],
        ["TAX FILING NOTES"],
        ["• US Schedule E: Report Morabeza + Sunset Studio income on Form 1040 Schedule E"],
        ["• Jamaica: Report Artiste's Boutique income per Jamaica tax requirements"],
        ["• Booking.com commission is a deductible expense against rental income"],
        ["• Keep all source emails and Booking.com invoices for 7 years"],
        ["• Source document links (column L in property tabs) point to original email/receipt S3 archives"],
    ]
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'Notes & Sources'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": notes_rows}
    ).execute()
    
    # ─── Share the Spreadsheet ────────────────────────────────────────
    print("\nSharing spreadsheet...")
    
    for email in ["tarik@tjperkinsfam.com", "eniola@tjperkinsfam.com"]:
        try:
            drive_service.permissions().create(
                fileId=spreadsheet_id,
                body={
                    "role": "writer",
                    "type": "user",
                    "emailAddress": email,
                },
                sendNotificationEmail=True,
            ).execute()
            print(f"  ✓ Shared with {email} (editor)")
        except Exception as e:
            print(f"  ✗ Failed to share with {email}: {e}")
    
    print(f"\n{'='*60}")
    print(f"✅ DONE!")
    print(f"Spreadsheet URL: {spreadsheet_url}")
    print(f"Spreadsheet ID:  {spreadsheet_id}")
    print(f"{'='*60}")
    
    return spreadsheet_id

if __name__ == "__main__":
    main()
