#!/usr/bin/env python3
"""
Store all BoA transactions in database and auto-classify using known patterns.
Then prepare data for Google Sheets classification tab.
"""
import json, re, os
import mysql.connector
from urllib.parse import urlparse
from datetime import datetime

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

def get_db():
    parsed = urlparse(DB_URL)
    return mysql.connector.connect(
        host=parsed.hostname, port=parsed.port or 3306,
        user=parsed.username, password=parsed.password,
        database=parsed.path.lstrip('/'), ssl_disabled=False
    )

def classify_transaction(txn):
    """Auto-classify a BoA transaction based on description patterns."""
    desc = txn['description'].upper()
    amount = txn['amount']
    acct = txn.get('account_number', '')
    
    # --- INCOME (positive amounts) ---
    if amount > 0:
        if 'STARTOUT' in desc:
            return 'startout_employment', 'Employment Income', 'Salary'
        if 'MAXFIELD MARKET' in desc and 'ZELLE' in desc.upper():
            return 'maxfield_market', "Owner's Income", "Owner's Draw"
        if 'ROBINHOOD' in desc and 'CREDITS' in desc:
            return 'investment', 'Investment Return', 'Brokerage Withdrawal'
        if 'STASH CAPITAL' in desc:
            return 'investment', 'Investment Return', 'Brokerage Withdrawal'
        if 'FUNDRISE' in desc:
            return 'investment', 'Investment Return', 'Real Estate Fund'
        if 'VARIABLE ANN' in desc or 'AMER GEN' in desc:
            return 'investment', 'Investment Return', 'Annuity Payout'
        if 'INTEREST' in desc:
            return 'fee_interest', 'Interest Income', 'Bank Interest'
        # Transfers from other own accounts
        if 'TRANSFER FROM' in desc or 'ONLINE BANKING TRANSFER FROM' in desc:
            return 'transfer', 'Internal Transfer', 'Transfer'
        if 'KEEP THE CHANGE' in desc:
            return 'transfer', 'Internal Transfer', 'Keep the Change'
        # Zelle income
        if 'ZELLE' in desc and 'FROM' in desc:
            if 'ROSIELEE' in desc or 'ROSIE' in desc:
                return 'personal_household', 'Personal Income', 'Loan Repayment'
            if 'OWOICHO' in desc or 'AMEH' in desc:
                return 'personal_household', 'Personal Income', 'Personal'
            return 'personal_household', 'Personal Income', 'Personal'
        return None, None, None  # Unclassified income
    
    # --- EXPENSES (negative amounts) ---
    abs_amt = abs(amount)
    
    # Credit card payments (transfers, not expenses)
    if 'CAPITAL ONE' in desc and ('MOBILE PMT' in desc or 'PAYMENT' in desc):
        if 'AUTO' in desc or 'CARPAY' in desc:
            return 'personal_household', 'Auto Loan', 'Auto Loan Payment'
        return 'transfer', 'Credit Card Payment', 'Capital One'
    if 'AMERICAN EXPRESS' in desc and 'ACH PMT' in desc:
        return 'transfer', 'Credit Card Payment', 'American Express'
    if 'COMN CAP APY' in desc or ('WELLS FARGO' in desc and 'AUTO' in desc):
        return 'personal_household', 'Auto Loan', 'Auto Loan Payment'
    
    # Internal transfers
    if 'TRANSFER TO CHK 0613' in desc or 'TRANSFER TO CHK 9281' in desc:
        if abs_amt == 350:
            return 'personal_household', "Herma's Allowance", 'Allowance'
        if abs_amt >= 2400 and abs_amt <= 2800:
            return 'personal_household', 'Rent (Fairfax VA)', 'Rent'
        return 'transfer', 'Internal Transfer', 'Transfer to Joint'
    if 'TRANSFER TO SAV' in desc:
        return 'transfer', 'Internal Transfer', 'Transfer to Savings'
    if 'CBNA ONLINE' in desc and 'FITRANSFER' in desc:
        return 'transfer', 'Internal Transfer', 'Transfer to Citizens'
    if 'KEEP THE CHANGE' in desc:
        return 'transfer', 'Internal Transfer', 'Keep the Change'
    
    # Owner's equity injection
    if 'MAXFIELD MARKET' in desc and 'ZELLE' in desc.upper():
        return 'maxfield_market', "Owner's Equity Injection", "Owner's Investment"
    if 'ZELLE' in desc and 'MAXFIELD' in desc:
        return 'maxfield_market', "Owner's Equity Injection", "Owner's Investment"
    
    # Investments
    if 'STASH CAPITAL' in desc:
        return 'investment', 'Investment', 'Stash'
    if 'ROBINHOOD' in desc and ('DEBITS' in desc or 'FUNDS' in desc):
        return 'investment', 'Investment', 'Robinhood'
    if 'FUNDRISE' in desc:
        return 'investment', 'Investment', 'Fundrise'
    
    # Childcare
    if 'ZELLE' in desc and 'RACQUEL STEER' in desc:
        return 'personal_household', 'Childcare', 'Childcare'
    if 'ZELLE' in desc and 'CATHERINE SCHROETER' in desc:
        return 'personal_household', 'Childcare', 'Childcare'
    if 'ZELLE' in desc and 'HOSEA' in desc:
        return 'personal_household', 'Childcare', 'Childcare'
    
    # Sara Pasqual - NY property cleaning (user corrected: NOT childcare)
    if 'ZELLE' in desc and 'SARA PASQUAL' in desc:
        return 'whole_building_ny', 'Cleaning', 'Cleaning Expense (Rental Property)'
    
    # NY Property cleaners
    if 'ZELLE' in desc and 'ADRIANA SALCO' in desc:
        return 'whole_building_ny', 'Cleaning', 'Cleaning Expense (Rental Property)'
    if 'ZELLE' in desc and 'C & C HOME STYLE' in desc:
        return 'whole_building_ny', 'Repairs', 'Repairs & Maintenance'
    
    # Personal loans / forex
    if 'ZELLE' in desc and 'JILLIAN SPINDLE' in desc:
        return 'personal_household', 'Personal Loan', 'Loan'
    if 'ZELLE' in desc and 'PAULINE FERRON' in desc:
        return 'personal_household', 'Personal (Forex)', 'Forex'
    if 'ZELLE' in desc and 'CHERYL BRYANT' in desc:
        return 'personal_household', 'Personal Loan', 'Loan'
    
    # Auto loan
    if 'AUTOPAYPLUS' in desc:
        return 'personal_household', 'Auto Loan', 'Auto Loan Payment'
    
    # Health Insurance
    if 'FIDELIS' in desc or 'NEW YORK QUALITY' in desc:
        return 'personal_household', 'Health Insurance', 'Insurance'
    
    # Subscriptions
    if 'PAYPAL' in desc:
        if 'SPOTIFYUSA' in desc:
            return 'personal_household', 'Entertainment/Subscriptions', 'Spotify'
        if 'TIMES NYTIME' in desc:
            return 'personal_household', 'Entertainment/Subscriptions', 'NY Times'
        if 'GOOGLE' in desc:
            return 'personal_household', 'Entertainment/Subscriptions', 'Google'
        return 'personal_household', 'Entertainment/Subscriptions', 'PayPal'
    
    if 'NETFLIX' in desc:
        return 'personal_household', 'Entertainment/Subscriptions', 'Netflix'
    if 'AMAZON PRIME' in desc or 'AMZN MKTP' in desc:
        return 'personal_household', 'Shopping', 'Amazon'
    if 'SPOTIFY' in desc:
        return 'personal_household', 'Entertainment/Subscriptions', 'Spotify'
    
    # Herma allowance (Zelle to Herma)
    if 'ZELLE' in desc and 'HERMA' in desc:
        return 'personal_household', "Herma's Allowance", 'Allowance'
    
    # Rent (Fairfax)
    if 'ZELLE' in desc and 'ANTIE SONIA' in desc:
        return 'personal_household', 'Personal', 'Personal'
    
    # Joint account transactions (account 0613)
    if acct and acct.endswith('0613'):
        # Most joint account transactions are household expenses
        if 'ZELLE' in desc and 'FROM' in desc:
            return 'transfer', 'Internal Transfer', 'Transfer'
        if 'TRANSFER FROM' in desc:
            return 'transfer', 'Internal Transfer', 'Transfer'
        return 'personal_household', 'Household', 'Joint Account Expense'
    
    # Savings account transactions
    if acct and acct.endswith('4173'):
        if 'TRANSFER' in desc:
            return 'transfer', 'Internal Transfer', 'Transfer'
        return 'transfer', 'Internal Transfer', 'Savings'
    
    return None, None, None  # Unclassified


def main():
    print("=" * 60)
    print("BOA TRANSACTION STORAGE & AUTO-CLASSIFICATION")
    print("=" * 60)
    
    # Load transactions
    with open('/home/ubuntu/tax_prep/boa_transactions_v2.json', 'r') as f:
        txns = json.load(f)
    
    print(f"\nLoaded {len(txns)} transactions")
    
    # Create table
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS boa_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_date DATE NOT NULL,
            description TEXT NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            account_number VARCHAR(20),
            account_type VARCHAR(20),
            vertical VARCHAR(50),
            category VARCHAR(100),
            qbo_category VARCHAR(100),
            classification_method VARCHAR(20) DEFAULT 'auto',
            split_pct DECIMAL(5,2) DEFAULT 100.00,
            source_file VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_date (transaction_date),
            INDEX idx_vertical (vertical),
            INDEX idx_category (category)
        )
    """)
    conn.commit()
    
    # Clear existing data
    cur.execute("DELETE FROM boa_transactions")
    conn.commit()
    
    # Classify and insert
    classified_count = 0
    unclassified_count = 0
    
    insert_sql = """
        INSERT INTO boa_transactions (transaction_date, description, amount, account_number, 
            account_type, vertical, category, qbo_category, classification_method, source_file)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    batch = []
    for txn in txns:
        vertical, category, qbo_cat = classify_transaction(txn)
        method = 'auto' if vertical else 'unclassified'
        
        if vertical:
            classified_count += 1
        else:
            unclassified_count += 1
        
        batch.append((
            txn['date'], txn['description'], txn['amount'],
            txn.get('account_number'), txn.get('account_type'),
            vertical, category, qbo_cat, method, txn.get('source_file')
        ))
    
    cur.executemany(insert_sql, batch)
    conn.commit()
    
    print(f"\nInserted {len(batch)} transactions")
    print(f"  Auto-classified: {classified_count} ({classified_count*100//len(batch)}%)")
    print(f"  Unclassified: {unclassified_count} ({unclassified_count*100//len(batch)}%)")
    
    # Summary by vertical
    cur.execute("""
        SELECT vertical, COUNT(*) as cnt, 
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_expense
        FROM boa_transactions
        GROUP BY vertical
        ORDER BY total_expense DESC
    """)
    
    print(f"\n{'Vertical':<25} {'Count':>6} {'Income':>12} {'Expense':>12}")
    print("-" * 60)
    for row in cur.fetchall():
        v = row[0] or 'UNCLASSIFIED'
        print(f"  {v:<23} {row[1]:>6} ${row[2] or 0:>10,.2f} ${row[3] or 0:>10,.2f}")
    
    # Show unclassified sample
    cur.execute("""
        SELECT transaction_date, description, amount, account_number
        FROM boa_transactions
        WHERE vertical IS NULL
        ORDER BY ABS(amount) DESC
        LIMIT 30
    """)
    
    print(f"\n\nTOP 30 UNCLASSIFIED (by amount):")
    print(f"{'Date':<12} {'Description':<60} {'Amount':>10} {'Acct':>6}")
    print("-" * 92)
    for row in cur.fetchall():
        acct_short = f"...{row[3][-4:]}" if row[3] else "?"
        print(f"  {str(row[0]):<10} {row[1][:58]:<58} ${row[2]:>9,.2f} {acct_short}")
    
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
