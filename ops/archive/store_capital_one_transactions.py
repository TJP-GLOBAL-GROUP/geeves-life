#!/usr/bin/env python3
"""
Store all Capital One transactions in database and auto-match to business verticals.
Combines 2024 CSV data + 2025/2026 PDF data.
Auto-matching rules based on merchant patterns.
"""
import mysql.connector
from urllib.parse import urlparse
import pandas as pd
import json, re
from datetime import datetime

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

# ============================================================
# AUTO-MATCHING RULES
# ============================================================
# Based on known merchants from 2024 analysis and user classifications

VERTICAL_RULES = [
    # Bohemian Lodges (Jamaica property)
    {'pattern': r'JPS[- ]ECOMMERCE|JPS ECOMMERCE', 'vertical': 'bohemian_lodges', 'category': 'Utilities', 'class': 'Property Expense'},
    {'pattern': r'BILL EXPRESS ONLINE', 'vertical': 'bohemian_lodges', 'category': 'Utilities', 'class': 'Property Expense'},
    {'pattern': r'DIGICEL JAMAICA', 'vertical': 'bohemian_lodges', 'category': 'Utilities', 'class': 'Property Expense'},
    {'pattern': r'NASCO HOME', 'vertical': 'bohemian_lodges', 'category': 'Repairs & Maintenance', 'class': 'Property Expense'},
    {'pattern': r'HOME & GARDEN CARE', 'vertical': 'bohemian_lodges', 'category': 'Repairs & Maintenance', 'class': 'Property Expense'},
    {'pattern': r'HI-LO', 'vertical': 'bohemian_lodges', 'category': 'Supplies', 'class': 'Property Expense'},
    {'pattern': r'LOSHUSAN SUPERMARKET', 'vertical': 'bohemian_lodges', 'category': 'Supplies', 'class': 'Property Expense'},
    {'pattern': r'JAMAICA PEGASUS', 'vertical': 'bohemian_lodges', 'category': 'Travel', 'class': 'Property Expense'},
    {'pattern': r'AIRWAYS INTERNATIONAL', 'vertical': 'bohemian_lodges', 'category': 'Travel', 'class': 'Property Expense'},
    {'pattern': r'VI-KELL ENTERPRISES', 'vertical': 'bohemian_lodges', 'category': 'Repairs & Maintenance', 'class': 'Property Expense'},
    
    # Morabeza / NY Properties
    {'pattern': r'LOWES|LOWE\'S', 'vertical': 'morabeza_suite', 'category': 'Repairs & Maintenance', 'class': 'Property Expense'},
    {'pattern': r'HOME DEPOT', 'vertical': 'morabeza_suite', 'category': 'Repairs & Maintenance', 'class': 'Property Expense'},
    
    # Maxfield Market
    {'pattern': r'MAXFIELD', 'vertical': 'maxfield_market', 'category': 'Business Expense', 'class': 'Business'},
    
    # Personal - clear patterns
    {'pattern': r'PYS\*Fidelis Care|FIDELIS', 'vertical': 'personal', 'category': 'Insurance', 'class': 'Personal'},
    {'pattern': r'HIMS & HERS', 'vertical': 'personal', 'category': 'Health Care', 'class': 'Personal'},
    {'pattern': r'ASF\*Finger Lakes Fitness', 'vertical': 'personal', 'category': 'Entertainment', 'class': 'Personal'},
    {'pattern': r'DisneyPLUS|DISNEY\+', 'vertical': 'personal', 'category': 'Entertainment', 'class': 'Personal'},
    {'pattern': r'NETFLIX', 'vertical': 'personal', 'category': 'Entertainment', 'class': 'Personal'},
    {'pattern': r'SPOTIFY', 'vertical': 'personal', 'category': 'Entertainment', 'class': 'Personal'},
    {'pattern': r'CAPITAL ONE MOBILE PYMT|CAPITAL ONE.*PYMT', 'vertical': 'payment', 'category': 'Payment', 'class': 'Payment'},
    {'pattern': r'INTEREST CHARGE', 'vertical': 'unclassified', 'category': 'Fee/Interest', 'class': 'Fee'},
    
    # Grocery/Household (personal unless flagged)
    {'pattern': r'WM SUPERCENTER|WAL-MART|WALMART', 'vertical': 'personal', 'category': 'Groceries/Household', 'class': 'Personal'},
    {'pattern': r'MILLWOOD MARKET', 'vertical': 'personal', 'category': 'Groceries', 'class': 'Personal'},
    
    # Transportation (personal unless flagged)
    {'pattern': r'SUNOCO|SHELL|EXXON|MOBIL|BP |CITGO', 'vertical': 'personal', 'category': 'Gas/Auto', 'class': 'Personal'},
    {'pattern': r'UBER', 'vertical': 'personal', 'category': 'Transportation', 'class': 'Personal'},
]


def classify_transaction(description):
    """Apply auto-matching rules to classify a transaction."""
    desc_upper = description.upper()
    for rule in VERTICAL_RULES:
        if re.search(rule['pattern'], description, re.IGNORECASE):
            return {
                'vertical': rule['vertical'],
                'category': rule['category'],
                'class': rule['class'],
                'confidence': 'high'
            }
    return {
        'vertical': 'unclassified',
        'category': None,
        'class': None,
        'confidence': None
    }


def main():
    print("=" * 60)
    print("STORING CAPITAL ONE TRANSACTIONS IN DATABASE")
    print("=" * 60)
    
    # --- Load 2024 CSV data ---
    print("\n1. Loading 2024 CSV data...")
    df1 = pd.read_csv('/home/ubuntu/tax_prep/january_to_june_capital_one.csv')
    df2 = pd.read_csv('/home/ubuntu/tax_prep/july_to_december_capital_one.csv')
    df_csv = pd.concat([df1, df2], ignore_index=True)
    print(f"   2024 CSV: {len(df_csv)} transactions")
    
    # --- Load 2025/2026 PDF data ---
    print("\n2. Loading 2025/2026 PDF data...")
    with open('/home/ubuntu/tax_prep/capital_one_pdf_transactions.json', 'r') as f:
        pdf_txns = json.load(f)
    print(f"   PDF: {len(pdf_txns)} transactions")
    
    # --- Create database table ---
    print("\n3. Creating database table...")
    parsed = urlparse(DB_URL)
    conn = mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("DROP TABLE IF EXISTS capital_one_transactions")
    cursor.execute("""
        CREATE TABLE capital_one_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_date DATE NOT NULL,
            posted_date DATE,
            card_number VARCHAR(10),
            description VARCHAR(255) NOT NULL,
            capital_one_category VARCHAR(50),
            amount DECIMAL(10,2) NOT NULL COMMENT 'Positive=debit/spend, Negative=credit/payment',
            is_debit BOOLEAN NOT NULL,
            business_vertical VARCHAR(50) DEFAULT 'unclassified',
            qbo_class VARCHAR(50),
            qbo_expense_category VARCHAR(100),
            auto_matched BOOLEAN DEFAULT FALSE,
            match_confidence VARCHAR(10),
            foreign_amount VARCHAR(20),
            foreign_currency VARCHAR(5),
            exchange_rate VARCHAR(30),
            source_file VARCHAR(100),
            year INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_date (transaction_date),
            INDEX idx_vertical (business_vertical),
            INDEX idx_year (year),
            INDEX idx_category (capital_one_category)
        )
    """)
    conn.commit()
    print("   Table created: capital_one_transactions")
    
    # --- Insert 2024 CSV data ---
    print("\n4. Inserting 2024 CSV transactions...")
    csv_count = 0
    for _, row in df_csv.iterrows():
        desc = str(row['Description'])
        debit = float(row['Debit']) if pd.notna(row['Debit']) else 0
        credit = float(row['Credit']) if pd.notna(row['Credit']) else 0
        
        if debit > 0:
            amount = debit
            is_debit = True
        else:
            amount = -credit
            is_debit = False
        
        # Auto-classify
        classification = classify_transaction(desc)
        
        cursor.execute("""
            INSERT INTO capital_one_transactions 
            (transaction_date, posted_date, card_number, description, capital_one_category,
             amount, is_debit, business_vertical, qbo_class, qbo_expense_category,
             auto_matched, match_confidence, source_file, year)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            row['Transaction Date'], row['Posted Date'], str(row['Card No.']),
            desc, row['Category'],
            amount, is_debit,
            classification['vertical'], classification['class'], classification['category'],
            classification['confidence'] is not None, classification['confidence'],
            'csv_2024', 2024
        ))
        csv_count += 1
    
    conn.commit()
    print(f"   Inserted {csv_count} CSV transactions")
    
    # --- Insert 2025/2026 PDF data ---
    print("\n5. Inserting 2025/2026 PDF transactions...")
    pdf_count = 0
    for txn in pdf_txns:
        desc = txn['description']
        amount = txn['amount']
        is_debit = amount > 0
        
        # Parse date
        txn_date = txn['transaction_date']
        post_date = txn['posted_date']
        
        # Determine year
        year = None
        if txn_date and len(txn_date) >= 4:
            try:
                year = int(txn_date[:4])
            except:
                pass
        
        # Auto-classify
        classification = classify_transaction(desc)
        
        cursor.execute("""
            INSERT INTO capital_one_transactions 
            (transaction_date, posted_date, card_number, description, capital_one_category,
             amount, is_debit, business_vertical, qbo_class, qbo_expense_category,
             auto_matched, match_confidence, foreign_amount, foreign_currency, exchange_rate,
             source_file, year)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            txn_date if txn_date and len(txn_date) == 10 else None,
            post_date if post_date and len(post_date) == 10 else None,
            txn.get('card_number'),
            desc, None,
            amount, is_debit,
            classification['vertical'], classification['class'], classification['category'],
            classification['confidence'] is not None, classification['confidence'],
            txn.get('foreign_amount'), txn.get('foreign_currency'), txn.get('exchange_rate'),
            txn.get('source_file', 'pdf_2025_2026')[:100],
            year
        ))
        pdf_count += 1
    
    conn.commit()
    print(f"   Inserted {pdf_count} PDF transactions")
    
    # --- Summary ---
    print("\n" + "=" * 60)
    print("CLASSIFICATION SUMMARY")
    print("=" * 60)
    
    cursor.execute("""
        SELECT business_vertical, year, 
               COUNT(*) as cnt, 
               SUM(CASE WHEN is_debit THEN amount ELSE 0 END) as total_debits,
               SUM(CASE WHEN NOT is_debit THEN ABS(amount) ELSE 0 END) as total_credits
        FROM capital_one_transactions
        GROUP BY business_vertical, year
        ORDER BY business_vertical, year
    """)
    
    results = cursor.fetchall()
    current_vertical = None
    for r in results:
        if r['business_vertical'] != current_vertical:
            current_vertical = r['business_vertical']
            print(f"\n  {current_vertical.upper()}")
        print(f"    {r['year']}: {r['cnt']:>4} txns | Debits ${float(r['total_debits']):>10,.2f} | Credits ${float(r['total_credits']):>10,.2f}")
    
    # Count unclassified
    cursor.execute("""
        SELECT COUNT(*) as cnt, SUM(CASE WHEN is_debit THEN amount ELSE 0 END) as total
        FROM capital_one_transactions
        WHERE business_vertical = 'unclassified' AND is_debit = TRUE
    """)
    unclassified = cursor.fetchone()
    print(f"\n  ⚠️  UNCLASSIFIED DEBITS: {unclassified['cnt']} transactions, ${float(unclassified['total']):,.2f}")
    
    # Top unclassified merchants
    cursor.execute("""
        SELECT description, COUNT(*) as cnt, SUM(amount) as total
        FROM capital_one_transactions
        WHERE business_vertical = 'unclassified' AND is_debit = TRUE
        GROUP BY description
        ORDER BY total DESC
        LIMIT 20
    """)
    print(f"\n  Top unclassified merchants:")
    for r in cursor.fetchall():
        print(f"    {r['description'][:50]:<50} {r['cnt']:>3} txns | ${float(r['total']):>8,.2f}")
    
    conn.close()
    print(f"\n✅ Total stored: {csv_count + pdf_count} transactions")


if __name__ == '__main__':
    main()
