#!/usr/bin/env python3
"""Parse all CBNA bank statements (PDF) - handles both old and new format."""
import subprocess
import re
import os
import csv
from datetime import datetime

cbna_dir = '/home/ubuntu/tax_prep/gdrive_data/cbna'

def parse_statement(filepath):
    """Extract statement metadata and transactions from a CBNA PDF."""
    result = subprocess.run(['pdftotext', '-layout', filepath, '-'], capture_output=True, text=True)
    text = result.stdout
    
    # Determine account type
    account_type = None
    account_num = None
    
    if 'XXXXXX8792' in text or 'Carefree Checking' in text.upper() or 'CAREFREE CHECKING' in text:
        account_type = 'Checking'
        account_num = '8792'
    elif 'XXXXXX8774' in text or 'Free Savings' in text:
        account_type = 'Savings'
        account_num = '8774'
    
    # Get statement dates
    statement_dates = None
    m = re.search(r'Statement Dates\s+(\d+/\d+/\d+)\s+thru\s+(\d+/\d+/\d+)', text)
    if m:
        statement_dates = (m.group(1), m.group(2))
    
    # Get ending balance
    ending_balance = None
    m = re.search(r'Ending Balance\s+([\d,]+\.\d+)', text)
    if m:
        ending_balance = float(m.group(1).replace(',', ''))
    
    # Determine year from statement dates
    year = None
    if statement_dates:
        try:
            year = datetime.strptime(statement_dates[0], '%m/%d/%y').year
        except:
            pass
    
    # Extract transactions - handle both formats
    transactions = []
    lines = text.split('\n')
    in_transactions = False
    
    for line in lines:
        # Detect transaction section start
        if 'Activity In Date Order' in line or 'TRANSACTIONS' in line:
            in_transactions = True
            continue
        if 'Date' in line and 'Description' in line and ('Amount' in line or 'Credits/Debits' in line or 'Balance' in line):
            continue  # Skip header line
        
        if not in_transactions:
            continue
            
        # Skip non-transaction lines
        if 'Branch Phone Number' in line or 'Page:' in line or 'Statement Date:' in line or 'Primary Account:' in line:
            continue
        if 'TRANSACTIONS (CONT.)' in line:
            continue
        if 'SERVICE CHARGE SUMMARY' in line or 'FEES SUMMARY' in line:
            in_transactions = False
            continue
        
        # NEW FORMAT: Date  Description  Credits/Debits  Balance
        # "9/13         zel* MAXFIELD MARKET GLOBAL...    400.00    432.79"
        # Amounts can be negative (debits)
        m = re.match(r'\s*(\d+/\d+)\s+(.+?)\s{2,}(-?[\d,]+\.\d+)\s+([\d,.-]+\.\d+)?\s*$', line)
        if m:
            date_str = m.group(1)
            desc = m.group(2).strip()
            amount_str = m.group(3).replace(',', '')
            amount = float(amount_str)
            balance = float(m.group(4).replace(',', '')) if m.group(4) else None
            transactions.append({
                'date': date_str,
                'description': desc,
                'amount': amount,
                'balance': balance,
                'year': year
            })
            continue
        
        # OLD FORMAT: Date  Description  Amount  Balance (all positive, debits in separate column)
        m = re.match(r'\s*(\d+/\d+)\s+(.+?)\s{2,}([\d,]+\.\d+)\s+([\d,]+\.\d+)', line)
        if m:
            date_str = m.group(1)
            desc = m.group(2).strip()
            amount = float(m.group(3).replace(',', ''))
            balance = float(m.group(4).replace(',', ''))
            transactions.append({
                'date': date_str,
                'description': desc,
                'amount': amount,
                'balance': balance,
                'year': year
            })
            continue
        
        # Try single amount at end
        m = re.match(r'\s*(\d+/\d+)\s+(.+?)\s{2,}(-?[\d,]+\.\d+)\s*$', line)
        if m:
            date_str = m.group(1)
            desc = m.group(2).strip()
            amount = float(m.group(3).replace(',', ''))
            transactions.append({
                'date': date_str,
                'description': desc,
                'amount': amount,
                'balance': None,
                'year': year
            })
    
    return {
        'file': os.path.basename(filepath),
        'account_type': account_type,
        'account_num': account_num,
        'statement_dates': statement_dates,
        'ending_balance': ending_balance,
        'transactions': transactions,
        'year': year
    }

# Parse all statements
statements = []
files = sorted(os.listdir(cbna_dir))
for f in files:
    if f.endswith('.pdf'):
        filepath = os.path.join(cbna_dir, f)
        stmt = parse_statement(filepath)
        statements.append(stmt)

# Sort by date
def get_sort_key(s):
    if s['statement_dates']:
        try:
            return datetime.strptime(s['statement_dates'][0], '%m/%d/%y')
        except:
            pass
    return datetime(2099, 1, 1)

statements.sort(key=get_sort_key)

# Separate by account
checking = [s for s in statements if s['account_type'] == 'Checking']
savings = [s for s in statements if s['account_type'] == 'Savings']

print("=" * 90)
print("CBNA CHECKING (x8792) - Statement Summary")
print("=" * 90)
total_checking_txns = 0
for s in checking:
    dates = f"{s['statement_dates'][0]} - {s['statement_dates'][1]}" if s['statement_dates'] else "Unknown"
    n = len(s['transactions'])
    total_checking_txns += n
    deposits = sum(t['amount'] for t in s['transactions'] if t['amount'] > 0)
    debits = sum(abs(t['amount']) for t in s['transactions'] if t['amount'] < 0)
    print(f"  {dates:<25} | {n:>3} txns | Deposits: ${deposits:>10,.2f} | Debits: ${debits:>10,.2f} | End Bal: ${s['ending_balance'] or 0:>10,.2f}")

print(f"\n  Total checking transactions parsed: {total_checking_txns}")

print("\n" + "=" * 90)
print("CBNA SAVINGS (x8774) - Statement Summary")
print("=" * 90)
total_savings_txns = 0
for s in savings:
    dates = f"{s['statement_dates'][0]} - {s['statement_dates'][1]}" if s['statement_dates'] else "Unknown"
    n = len(s['transactions'])
    total_savings_txns += n
    print(f"  {dates:<25} | {n:>3} txns | End Bal: ${s['ending_balance'] or 0:>10,.2f}")

print(f"\n  Total savings transactions parsed: {total_savings_txns}")

# All checking transactions
print("\n" + "=" * 90)
print("ALL CHECKING TRANSACTIONS (chronological)")
print("=" * 90)
all_checking_txns = []
for s in checking:
    for t in s['transactions']:
        # Build full date
        if s['statement_dates']:
            try:
                start = datetime.strptime(s['statement_dates'][0], '%m/%d/%y')
                year = start.year
            except:
                year = 2024
        else:
            year = t.get('year', 2024)
        
        month_day = t['date']
        parts = month_day.split('/')
        full_date = f"{parts[0]}/{parts[1]}/{str(year)[2:]}"
        t['full_date'] = full_date
        t['sort_date'] = datetime.strptime(full_date, '%m/%d/%y')
        all_checking_txns.append(t)

all_checking_txns.sort(key=lambda x: x['sort_date'])

for t in all_checking_txns:
    amt_str = f"${t['amount']:>10,.2f}" if t['amount'] >= 0 else f"-${abs(t['amount']):>9,.2f}"
    txn_type = "CREDIT" if t['amount'] > 0 else "DEBIT"
    print(f"  {t['full_date']:<10} | {txn_type:<6} | {amt_str} | {t['description'][:60]}")

# Identify VRBO/STR deposits
print("\n" + "=" * 90)
print("POTENTIAL STR-RELATED TRANSACTIONS")
print("=" * 90)
str_keywords = ['vrbo', 'homeaway', 'airbnb', 'booking', 'stripe', 'paypal', 'vacation']
for t in all_checking_txns:
    desc_lower = t['description'].lower()
    if any(kw in desc_lower for kw in str_keywords):
        amt_str = f"${t['amount']:>10,.2f}" if t['amount'] >= 0 else f"-${abs(t['amount']):>9,.2f}"
        print(f"  {t['full_date']:<10} | {amt_str} | {t['description']}")

# Write to CSV for workbook import
csv_path = '/home/ubuntu/tax_prep/cbna_checking_transactions.csv'
with open(csv_path, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Date', 'Description', 'Amount', 'Balance', 'Type'])
    for t in all_checking_txns:
        txn_type = 'Credit' if t['amount'] > 0 else 'Debit'
        writer.writerow([t['full_date'], t['description'], t['amount'], t.get('balance', ''), txn_type])

print(f"\nCSV written: {csv_path} ({len(all_checking_txns)} transactions)")

# Also write savings
csv_path_savings = '/home/ubuntu/tax_prep/cbna_savings_transactions.csv'
all_savings_txns = []
for s in savings:
    for t in s['transactions']:
        if s['statement_dates']:
            try:
                start = datetime.strptime(s['statement_dates'][0], '%m/%d/%y')
                year = start.year
            except:
                year = 2024
        else:
            year = 2024
        parts = t['date'].split('/')
        t['full_date'] = f"{parts[0]}/{parts[1]}/{str(year)[2:]}"
        all_savings_txns.append(t)

with open(csv_path_savings, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Date', 'Description', 'Amount', 'Balance', 'Type'])
    for t in all_savings_txns:
        txn_type = 'Credit' if t['amount'] > 0 else 'Debit'
        writer.writerow([t['full_date'], t['description'], t['amount'], t.get('balance', ''), txn_type])

print(f"CSV written: {csv_path_savings} ({len(all_savings_txns)} transactions)")
