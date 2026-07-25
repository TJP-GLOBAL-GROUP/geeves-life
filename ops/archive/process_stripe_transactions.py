#!/usr/bin/env python3
"""
Process Stripe balance_history.csv:
1. Classify all transactions to business verticals
2. Create stripe_transactions table in DB
3. Store all transactions with fees
4. Handle refunds and stripe_fee entries
"""
import pandas as pd
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime
import re
import json

# --- Config ---
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
CSV_PATH = '/home/ubuntu/upload/balance_history.csv'

# --- Database connection ---
parsed = urlparse(DB_URL)
conn = mysql.connector.connect(
    host=parsed.hostname, port=parsed.port or 3306,
    user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), ssl_disabled=False
)
cursor = conn.cursor(dictionary=True)

# --- Create table ---
print("Creating stripe_transactions table...")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS stripe_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stripe_txn_id VARCHAR(100) UNIQUE,
        type VARCHAR(50) NOT NULL,
        source VARCHAR(100),
        amount DECIMAL(12,2) NOT NULL,
        fee DECIMAL(12,2) DEFAULT 0,
        destination_platform_fee DECIMAL(12,2) DEFAULT 0,
        net DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        customer_facing_amount DECIMAL(12,2),
        customer_facing_currency VARCHAR(10),
        created_at DATETIME NOT NULL,
        available_on DATETIME,
        description TEXT,
        business_vertical ENUM('bohemian_lodges', 'maxfield_market', 'maxfield_bakery', 'platform_fee', 'payout', 'unclassified') NOT NULL,
        sub_category VARCHAR(100),
        booking_confirmation VARCHAR(50),
        order_reference VARCHAR(100),
        transfer_id VARCHAR(100),
        transfer_date DATE,
        metadata_json JSON,
        created_in_db TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""")
conn.commit()
print("  Table created/verified.")

# --- Load CSV ---
df = pd.read_csv(CSV_PATH)
print(f"\nLoaded {len(df)} transactions from CSV")

# --- Classification function ---
def classify_transaction(row):
    """Classify each transaction to a business vertical."""
    txn_type = str(row['Type']).lower()
    desc = str(row.get('Description', '')).lower()
    module = str(row.get('Module (metadata)', ''))
    cust_currency = str(row.get('Customer Facing Currency', '')).lower()
    payment_type = str(row.get('payment_type (metadata)', ''))
    amount = float(row.get('Amount', 0))
    
    # Payouts are their own category
    if txn_type == 'payout':
        return 'payout', 'bank_transfer'
    
    # Stripe platform fees (Radar, Post Payment Invoices)
    if txn_type == 'stripe_fee':
        return 'platform_fee', 'stripe_service_fee'
    
    # --- CHARGES ---
    if txn_type == 'charge':
        # Maxfield Market - Magento orders
        if 'order #300' in desc or 'magento' in module.lower():
            return 'maxfield_market', 'website_order'
        
        # Maxfield Bakery - MBOMS orders (JMD currency)
        if cust_currency == 'jmd':
            return 'maxfield_bakery', 'mboms_order'
        if 'mboms.maxfieldbakery.com' in desc or 'maxorderform' in desc:
            return 'maxfield_bakery', 'mboms_order'
        if payment_type in ('deposit', 'final'):
            return 'maxfield_bakery', 'mboms_order'
        
        # Easter Buns
        if 'easter bun' in desc:
            return 'maxfield_bakery', 'easter_bun_order'
        
        # Rickey's Caribbean (ackeeman@yahoo) - Maxfield Bakery
        # The $7,817.95 Jan 2024 entry with no description is Rickey's
        if amount == 7817.95:
            return 'maxfield_bakery', 'rickeys_caribbean'
        
        # Bohemian Lodges - Booking.com / lodging
        if 'bohemian' in desc or 'booking.com' in desc or 'booking number' in desc:
            return 'bohemian_lodges', 'booking_com_payment'
        if 'lodg' in desc:
            return 'bohemian_lodges', 'direct_booking'
        
        # "Payment for Invoice" - Booking.com customer payments
        if 'payment for invoice' in desc:
            return 'bohemian_lodges', 'booking_com_invoice_payment'
        
        # $88.54 damage fee for Artiste's Boutique
        if amount == 88.54 and '2025-06' in str(row.get('Created (UTC)', '')):
            return 'bohemian_lodges', 'damage_fee'
        
        return 'unclassified', 'unknown'
    
    # --- REFUNDS ---
    if txn_type == 'payment_refund':
        # Try to classify refunds by description
        if cust_currency == 'jmd':
            return 'maxfield_bakery', 'refund'
        if 'mboms' in desc or 'maxorderform' in desc:
            return 'maxfield_bakery', 'refund'
        if 'order #300' in desc:
            return 'maxfield_market', 'refund'
        if 'bohemian' in desc or 'booking' in desc or 'lodg' in desc:
            return 'bohemian_lodges', 'refund'
        # Default refunds - check amount patterns
        return 'unclassified', 'refund'
    
    # --- ADJUSTMENTS ---
    if txn_type == 'adjustment':
        return 'unclassified', 'chargeback'
    
    return 'unclassified', 'unknown'

# --- Extract booking confirmation numbers ---
def extract_booking_conf(desc):
    """Extract Booking.com confirmation numbers from description."""
    desc = str(desc)
    # Pattern: "Reservation ID: XXXXXXXXXX" or just a 10-digit number
    match = re.search(r'(?:Reservation ID:|booking\.com|Booking number:)\s*(\d{10})', desc)
    if match:
        return match.group(1)
    # Standalone 10-digit number in description
    match = re.search(r'\b(\d{10})\b', desc)
    if match:
        return match.group(1)
    return None

# --- Process and insert ---
print("\nClassifying and inserting transactions...")
inserted = 0
skipped = 0
verticals_summary = {}

for _, row in df.iterrows():
    stripe_txn_id = row['id']
    vertical, sub_cat = classify_transaction(row)
    
    # Track summary
    if vertical not in verticals_summary:
        verticals_summary[vertical] = {'count': 0, 'amount': 0, 'fees': 0}
    verticals_summary[vertical]['count'] += 1
    verticals_summary[vertical]['amount'] += float(row.get('Amount', 0) or 0)
    verticals_summary[vertical]['fees'] += float(row.get('Fee', 0) or 0)
    
    # Parse dates
    created_str = str(row.get('Created (UTC)', ''))
    available_str = str(row.get('Available On (UTC)', ''))
    transfer_date_str = str(row.get('Transfer Date (UTC)', ''))
    
    created_at = None
    if created_str and created_str != 'nan':
        try:
            created_at = datetime.strptime(created_str, '%Y-%m-%d %H:%M')
        except:
            try:
                created_at = datetime.strptime(created_str[:10], '%Y-%m-%d')
            except:
                pass
    
    available_on = None
    if available_str and available_str != 'nan':
        try:
            available_on = datetime.strptime(available_str, '%Y-%m-%d %H:%M')
        except:
            try:
                available_on = datetime.strptime(available_str[:10], '%Y-%m-%d')
            except:
                pass
    
    transfer_date = None
    if transfer_date_str and transfer_date_str != 'nan':
        try:
            transfer_date = datetime.strptime(transfer_date_str[:10], '%Y-%m-%d').date()
        except:
            pass
    
    # Build metadata
    metadata = {}
    for col in ['order_id (metadata)', 'payment_type (metadata)', 'order_number (metadata)',
                'tracking_url (metadata)', 'Payment Location (metadata)', 
                'Payment Method (metadata)', 'Guest (metadata)', 'Order # (metadata)', 'Module (metadata)']:
        val = row.get(col)
        if pd.notna(val) and str(val) != 'nan':
            key = col.replace(' (metadata)', '').replace(' ', '_').lower()
            metadata[key] = str(val)
    
    booking_conf = extract_booking_conf(str(row.get('Description', '')))
    
    # Parse amounts
    amount = float(row.get('Amount', 0) or 0)
    fee = float(row.get('Fee', 0) or 0)
    dest_fee = float(row.get('Destination Platform Fee', 0) or 0) if pd.notna(row.get('Destination Platform Fee')) else 0
    net = float(row.get('Net', 0) or 0)
    cfa = float(row.get('Customer Facing Amount', 0) or 0) if pd.notna(row.get('Customer Facing Amount')) else None
    cfc = str(row.get('Customer Facing Currency', '')) if pd.notna(row.get('Customer Facing Currency')) else None
    
    order_ref = None
    desc_text = str(row.get('Description', ''))
    if 'Order #' in desc_text:
        match = re.search(r'Order #(\d+)', desc_text)
        if match:
            order_ref = match.group(1)
    elif 'ORD-' in desc_text:
        match = re.search(r'(ORD-\w+)', desc_text)
        if match:
            order_ref = match.group(1)
    
    try:
        cursor.execute("""
            INSERT INTO stripe_transactions 
            (stripe_txn_id, type, source, amount, fee, destination_platform_fee, net,
             currency, customer_facing_amount, customer_facing_currency,
             created_at, available_on, description, business_vertical, sub_category,
             booking_confirmation, order_reference, transfer_id, transfer_date, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                business_vertical = VALUES(business_vertical),
                sub_category = VALUES(sub_category)
        """, (
            stripe_txn_id, row['Type'], str(row.get('Source', '')) if pd.notna(row.get('Source')) else None,
            amount, fee, dest_fee, net,
            str(row.get('Currency', 'usd')), cfa, cfc,
            created_at, available_on, desc_text if desc_text != 'nan' else None,
            vertical, sub_cat,
            booking_conf, order_ref,
            str(row.get('Transfer', '')) if pd.notna(row.get('Transfer')) else None,
            transfer_date,
            json.dumps(metadata) if metadata else None
        ))
        inserted += 1
    except Exception as e:
        print(f"  ERROR inserting {stripe_txn_id}: {e}")
        skipped += 1

conn.commit()

print(f"\n  Inserted: {inserted}, Skipped: {skipped}")
print(f"\n=== CLASSIFICATION SUMMARY ===")
print(f"{'Vertical':<20} {'Count':>6} {'Amount':>12} {'Fees':>10}")
print("-" * 50)
for v in sorted(verticals_summary.keys()):
    s = verticals_summary[v]
    print(f"  {v:<18} {s['count']:>6} ${s['amount']:>10,.2f} ${s['fees']:>8,.2f}")

# Detailed breakdown for charges only
print(f"\n=== CHARGES BY VERTICAL (income only) ===")
cursor.execute("""
    SELECT business_vertical, sub_category, 
           COUNT(*) as cnt, SUM(amount) as total_amount, SUM(fee) as total_fees, SUM(net) as total_net
    FROM stripe_transactions
    WHERE type = 'charge'
    GROUP BY business_vertical, sub_category
    ORDER BY business_vertical, total_amount DESC
""")
for row in cursor.fetchall():
    print(f"  {row['business_vertical']:<20} {row['sub_category']:<25} {row['cnt']:>3} charges  ${float(row['total_amount']):>10,.2f}  fees ${float(row['total_fees']):>8,.2f}  net ${float(row['total_net']):>10,.2f}")

# Refunds breakdown
print(f"\n=== REFUNDS BY VERTICAL ===")
cursor.execute("""
    SELECT business_vertical, 
           COUNT(*) as cnt, SUM(amount) as total_amount, SUM(fee) as total_fees
    FROM stripe_transactions
    WHERE type = 'payment_refund'
    GROUP BY business_vertical
""")
for row in cursor.fetchall():
    print(f"  {row['business_vertical']:<20} {row['cnt']:>3} refunds  ${float(row['total_amount']):>10,.2f}  fees ${float(row['total_fees']):>8,.2f}")

conn.close()
print("\n✅ All Stripe transactions stored in database!")
