#!/usr/bin/env python3
"""
Store all 963 business account transactions in the database and auto-classify by vertical.
Two accounts:
- 898104152448 = Business Checking (Maxfield Market Global LLC)
- 898125730108 = Business Savings
"""
import json, os, re
from datetime import datetime
import mysql.connector
from urllib.parse import urlparse

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )

def classify_transaction(desc, amount, acct):
    """Auto-classify based on description patterns."""
    desc_lower = desc.lower()
    
    # === LOANS (pass-through for Maxfield Bakery) ===
    if 'millicent comrie' in desc_lower:
        return 'maxfield_bakery', 'Loan', 'Loans Payable'
    if 'richard abisla' in desc_lower or 'abisla' in desc_lower:
        return 'maxfield_bakery', 'Loan', 'Loans Payable'
    
    # === MORTGAGE (Whole Building NY) ===
    if 'james curatolo' in desc_lower or 'jim curatolo' in desc_lower:
        return 'whole_building_ny', 'Property Expense', 'Mortgage Interest Paid'
    
    # === MAXFIELD BAKERY ===
    if 'smbx' in desc_lower and ('maxbpayfee' in desc_lower or 'escrow' in desc_lower or 'maxb' in desc_lower):
        if 'escrow' in desc_lower:
            return 'maxfield_bakery', 'Business', 'Bank Charges & Fees'
        return 'maxfield_bakery', 'Business', 'Bank Charges & Fees'
    if 'maxfield bakery' in desc_lower:
        return 'maxfield_bakery', 'Business', 'Cost of Goods Sold'
    
    # === MAXFIELD MARKET ===
    if 'shopify' in desc_lower:
        if amount > 0:
            return 'maxfield_market', 'Business', 'Sales of Product Income'
        return 'maxfield_market', 'Business', 'Web Services & Technology'
    if 'stripe' in desc_lower and 'maxfield market' in desc_lower:
        if amount > 0:
            return 'maxfield_market', 'Business', 'Sales of Product Income'
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    if 'stripe payments' in desc_lower:
        if amount > 0:
            return 'maxfield_market', 'Business', 'Sales of Product Income'
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    
    # === JAMAICA PROPERTY (Artiste's Boutique) ===
    if 'jps' in desc_lower and 'ecommerce' in desc_lower:
        return 'artistes_boutique', 'Property Expense', 'Utilities'
    if 'digicel jamaica' in desc_lower:
        return 'artistes_boutique', 'Property Expense', 'Utilities'
    if 'urban links' in desc_lower:
        return 'artistes_boutique', 'Property Expense', 'Supplies'
    if 'jamaica' in desc_lower and ('smoke' in desc_lower or 'appliance' in desc_lower):
        return 'artistes_boutique', 'Property Expense', 'Supplies'
    if 'barbican texa' in desc_lower:
        return 'artistes_boutique', 'Property Expense', 'Cash Withdrawal'
    if 'bill express' in desc_lower:
        return 'artistes_boutique', 'Property Expense', 'Utilities'
    
    # === WIRE TRANSFERS (International - likely Jamaica/Bakery) ===
    if 'wire type:intl in' in desc_lower and 'maxfield bakery' in desc_lower:
        return 'maxfield_bakery', 'Business', 'Sales of Product Income'
    if 'wire type:intl in' in desc_lower:
        return 'maxfield_bakery', 'Business', 'Sales of Product Income'
    if 'wire transfer fee' in desc_lower:
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    
    # === BANK FEES ===
    if 'monthly maintenance fee' in desc_lower or 'monthly fee' in desc_lower:
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    if 'international transaction fee' in desc_lower:
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    if 'external transfer fee' in desc_lower:
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    if 'service charge' in desc_lower:
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    
    # === INSURANCE ===
    if 'prog universal' in desc_lower or 'progressive' in desc_lower:
        return 'personal_household', 'Personal', 'Auto Insurance'
    if 'wayne' in desc_lower and 'insurance' in desc_lower:
        return 'whole_building_ny', 'Property Expense', 'Insurance'
    
    # === VERIZON (50/50 split) ===
    if 'verizon' in desc_lower:
        return 'split_personal_business', 'Split', 'Telephone'
    
    # === PROPERTY EXPENSES (NY) ===
    if 'lowes' in desc_lower:
        if amount < -200:  # Card payment
            return 'whole_building_ny', 'Property Expense', 'Repairs & Maintenance'
        return 'whole_building_ny', 'Property Expense', 'Supplies'
    if 'home depot' in desc_lower:
        return 'whole_building_ny', 'Property Expense', 'Supplies'
    if 'racquel steer' in desc_lower:
        return 'whole_building_ny', 'Property Expense', 'Cleaning & Maintenance'
    
    # === CLEANING / CONTRACTORS ===
    if 'nathan lanning' in desc_lower or 'scott lewin' in desc_lower or 'rodolfo' in desc_lower:
        return 'morabeza_suite', 'Property Expense', 'Contractors'
    if 'leslie laur' in desc_lower:
        return 'morabeza_suite', 'Property Expense', 'Repairs & Maintenance'
    
    # === TRANSFERS BETWEEN OWN ACCOUNTS ===
    if 'online banking transfer' in desc_lower and ('sav 0108' in desc_lower or 'chk 2448' in desc_lower):
        return 'transfer', 'Transfer', 'Internal Transfer'
    if 'transfer from sav' in desc_lower or 'transfer to sav' in desc_lower:
        return 'transfer', 'Transfer', 'Internal Transfer'
    if 'transfer from chk' in desc_lower or 'transfer to chk' in desc_lower:
        return 'transfer', 'Transfer', 'Internal Transfer'
    
    # === OWNER EQUITY (Zelle from personal) ===
    if 'zelle' in desc_lower and 'tarik' in desc_lower and amount > 0:
        return 'maxfield_market', 'Business', "Owner's Equity Injection"
    
    # === PAYPAL ===
    if 'paypal' in desc_lower:
        if amount > 0:
            return 'maxfield_market', 'Business', 'Sales of Product Income'
        return 'maxfield_market', 'Business', 'Bank Charges & Fees'
    
    # === INTEREST ===
    if 'interest earned' in desc_lower:
        return 'maxfield_market', 'Business', 'Interest Income'
    
    # === GOOGLE CLOUD / WORKSPACE ===
    if 'google' in desc_lower and ('cloud' in desc_lower or 'workspace' in desc_lower):
        return 'maxfield_market', 'Business', 'Web Services & Technology'
    
    # === STARTHUB ===
    if 'starthub' in desc_lower:
        return 'maxfield_market', 'Business', 'Web Services & Technology'
    
    # === QUICKBOOKS ===
    if 'intuit' in desc_lower or 'quickbooks' in desc_lower:
        return 'maxfield_market', 'Business', 'Web Services & Technology'
    
    # === ELECTRIFY AMERICA (EV charging) ===
    if 'electrify america' in desc_lower:
        return 'personal_household', 'Personal', 'Auto'
    
    # === GROCERY / PERSONAL ===
    if 'safeway' in desc_lower or 'walmart' in desc_lower or 'target' in desc_lower:
        return 'personal_household', 'Personal', 'Groceries'
    
    # === FAIRFAX VA items (personal after Sep 2025 move) ===
    if 'fairfax' in desc_lower and amount < 0:
        return 'personal_household', 'Personal', 'Supplies'
    
    # === RICKEY'S CARIBBEAN (customer payments) ===
    if 'rickey' in desc_lower or 'ackeeman' in desc_lower:
        return 'maxfield_bakery', 'Business', 'Sales of Product Income'
    
    # === DEFAULT: unclassified ===
    return None, None, None


def main():
    print("=" * 60)
    print("STORING & CLASSIFYING BUSINESS ACCOUNT TRANSACTIONS")
    print("=" * 60)
    
    # Load parsed transactions
    with open('/home/ubuntu/tax_prep/biz_transactions_parsed.json', 'r') as f:
        transactions = json.load(f)
    
    print(f"Loaded {len(transactions)} transactions")
    
    # Connect to DB
    conn = get_db()
    cur = conn.cursor()
    
    # Create table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS biz_account_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_date DATE,
            description TEXT,
            amount DECIMAL(12,2),
            transaction_type VARCHAR(20),
            account_number VARCHAR(20),
            account_type VARCHAR(20),
            card_number VARCHAR(10),
            business_vertical VARCHAR(50),
            qbo_class VARCHAR(50),
            qbo_expense_category VARCHAR(100),
            auto_classified BOOLEAN DEFAULT FALSE,
            source_file VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Clear existing data
    cur.execute("DELETE FROM biz_account_transactions")
    conn.commit()
    
    # Classify and insert
    classified_count = 0
    unclassified_count = 0
    vertical_totals = {}
    
    for t in transactions:
        # Parse date
        date_str = t['date']
        try:
            dt = datetime.strptime(date_str, '%m/%d/%y')
        except:
            try:
                dt = datetime.strptime(date_str, '%m/%d/%Y')
            except:
                dt = None
        
        # Classify
        vertical, qbo_class, category = classify_transaction(t['description'], t['amount'], t['account'])
        
        if vertical:
            classified_count += 1
            auto_classified = True
        else:
            unclassified_count += 1
            auto_classified = False
            vertical = 'unclassified'
            qbo_class = ''
            category = ''
        
        # Track totals
        if vertical not in vertical_totals:
            vertical_totals[vertical] = {'count': 0, 'income': 0, 'expense': 0}
        vertical_totals[vertical]['count'] += 1
        if t['amount'] > 0:
            vertical_totals[vertical]['income'] += t['amount']
        else:
            vertical_totals[vertical]['expense'] += t['amount']
        
        # Determine account type
        acct_type = 'checking' if t.get('account') == '898104152448' else 'savings'
        
        cur.execute("""
            INSERT INTO biz_account_transactions 
            (transaction_date, description, amount, transaction_type, account_number, 
             account_type, card_number, business_vertical, qbo_class, qbo_expense_category,
             auto_classified, source_file)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            dt.strftime('%Y-%m-%d') if dt else None,
            t['description'],
            t['amount'],
            t.get('type', 'unknown'),
            t.get('account', ''),
            acct_type,
            t.get('card'),
            vertical,
            qbo_class or '',
            category or '',
            auto_classified,
            t.get('source_file', '')
        ))
    
    conn.commit()
    
    # Print summary
    print(f"\n  Classified: {classified_count}")
    print(f"  Unclassified: {unclassified_count}")
    print(f"  Classification rate: {classified_count/len(transactions)*100:.1f}%")
    
    print(f"\n  By Vertical:")
    for v, totals in sorted(vertical_totals.items(), key=lambda x: x[1]['count'], reverse=True):
        print(f"    {v:<30} | {totals['count']:>4} txns | Income: ${totals['income']:>12,.2f} | Expense: ${totals['expense']:>12,.2f}")
    
    # Show unclassified samples
    cur.execute("""
        SELECT transaction_date, description, amount 
        FROM biz_account_transactions 
        WHERE business_vertical = 'unclassified'
        ORDER BY ABS(amount) DESC
        LIMIT 30
    """)
    rows = cur.fetchall()
    
    print(f"\n  Top 30 Unclassified (by amount):")
    for row in rows:
        print(f"    {row[0]} | ${row[2]:>10,.2f} | {row[1][:70]}")
    
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
