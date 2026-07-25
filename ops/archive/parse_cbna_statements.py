#!/usr/bin/env python3
"""Parse all CBNA bank statements (PDF) and extract transactions."""
import subprocess
import re
import os
from datetime import datetime

cbna_dir = '/home/ubuntu/tax_prep/gdrive_data/cbna'

def parse_statement(filepath):
    """Extract statement metadata and transactions from a CBNA PDF."""
    result = subprocess.run(['pdftotext', '-layout', filepath, '-'], capture_output=True, text=True)
    text = result.stdout
    
    # Determine account type and number
    account_type = None
    account_num = None
    statement_dates = None
    
    if 'Carefree Checking' in text:
        account_type = 'Checking'
        m = re.search(r'Carefree Checking\s+[X]+(\d+)', text)
        if m:
            account_num = m.group(1)
    elif 'Free Savings' in text:
        account_type = 'Savings'
        m = re.search(r'Free Savings\s+[X]+(\d+)', text)
        if m:
            account_num = m.group(1)
    
    if not account_type:
        if 'XXXXXX8792' in text or 'Primary Account:    XXXXXX8792' in text or 'Primary Account:   XXXXXX8792' in text:
            account_type = 'Checking'
            account_num = '8792'
        elif 'XXXXXX8774' in text or 'Primary Account:    XXXXXX8774' in text or 'Primary Account:   XXXXXX8774' in text:
            account_type = 'Savings'
            account_num = '8774'
    
    # Get statement dates
    m = re.search(r'Statement Dates\s+(\d+/\d+/\d+)\s+thru\s+(\d+/\d+/\d+)', text)
    if m:
        statement_dates = (m.group(1), m.group(2))
    
    # Get ending balance
    ending_balance = None
    m = re.search(r'Ending Balance\s+([\d,]+\.\d+)', text)
    if m:
        ending_balance = float(m.group(1).replace(',', ''))
    
    # Extract transactions from "Activity In Date Order" section
    transactions = []
    in_activity = False
    lines = text.split('\n')
    
    for line in lines:
        if 'Activity In Date Order' in line or 'Activity in Date Order' in line:
            in_activity = True
            continue
        if in_activity:
            # Match transaction lines: Date  Description  Amount  Balance
            # Format: "7/17    Transfer from x8792 to x8774    100.00    100.76"
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
                    'balance': balance
                })
            # Also try format with negative amounts or debits
            elif re.match(r'\s*(\d+/\d+)\s+', line):
                # Try simpler pattern
                m2 = re.match(r'\s*(\d+/\d+)\s+(.+)', line)
                if m2:
                    rest = m2.group(2)
                    # Find amounts at the end
                    amounts = re.findall(r'([\d,]+\.\d+)', rest)
                    if len(amounts) >= 1:
                        desc_part = re.sub(r'\s+[\d,]+\.\d+\s*$', '', rest)
                        desc_part = re.sub(r'\s+[\d,]+\.\d+\s*$', '', desc_part)
                        transactions.append({
                            'date': m2.group(1),
                            'description': desc_part.strip(),
                            'amount': float(amounts[0].replace(',', '')),
                            'balance': float(amounts[-1].replace(',', '')) if len(amounts) > 1 else None
                        })
            # Stop at page break or next section
            if 'Branch Phone Number' in line or 'Page' in line:
                # Could be multi-page, keep going
                pass
    
    return {
        'file': os.path.basename(filepath),
        'account_type': account_type,
        'account_num': account_num,
        'statement_dates': statement_dates,
        'ending_balance': ending_balance,
        'transactions': transactions,
        'raw_text': text
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

# Print summary
print("=" * 80)
print("CBNA ACCOUNT STATEMENTS SUMMARY")
print("=" * 80)

checking_stmts = [s for s in statements if s['account_type'] == 'Checking']
savings_stmts = [s for s in statements if s['account_type'] == 'Savings']
unknown_stmts = [s for s in statements if s['account_type'] is None]

print(f"\nChecking (x8792): {len(checking_stmts)} statements")
for s in checking_stmts:
    dates = f"{s['statement_dates'][0]} - {s['statement_dates'][1]}" if s['statement_dates'] else "Unknown dates"
    txn_count = len(s['transactions'])
    print(f"  {s['file']:<25} | {dates:<25} | {txn_count} transactions | Balance: ${s['ending_balance'] or 0:,.2f}")

print(f"\nSavings (x8774): {len(savings_stmts)} statements")
for s in savings_stmts:
    dates = f"{s['statement_dates'][0]} - {s['statement_dates'][1]}" if s['statement_dates'] else "Unknown dates"
    txn_count = len(s['transactions'])
    print(f"  {s['file']:<25} | {dates:<25} | {txn_count} transactions | Balance: ${s['ending_balance'] or 0:,.2f}")

if unknown_stmts:
    print(f"\nUnknown account: {len(unknown_stmts)} statements")
    for s in unknown_stmts:
        print(f"  {s['file']}")

# Print all checking transactions (where VRBO deposits would be)
print("\n" + "=" * 80)
print("CHECKING ACCOUNT (x8792) - ALL TRANSACTIONS")
print("=" * 80)
for s in checking_stmts:
    dates = f"{s['statement_dates'][0]} - {s['statement_dates'][1]}" if s['statement_dates'] else "Unknown"
    print(f"\n--- {dates} ({s['file']}) ---")
    for t in s['transactions']:
        print(f"  {t['date']:<8} | ${t['amount']:>10,.2f} | {t['description'][:60]}")
    if not s['transactions']:
        print("  (no transactions parsed)")

# Look for VRBO-related deposits
print("\n" + "=" * 80)
print("VRBO/STR-RELATED TRANSACTIONS (all accounts)")
print("=" * 80)
for s in statements:
    for t in s['transactions']:
        desc_lower = t['description'].lower()
        if any(kw in desc_lower for kw in ['vrbo', 'homeaway', 'airbnb', 'booking', 'stripe', 'paypal']):
            dates = s['statement_dates'][0] if s['statement_dates'] else '?'
            print(f"  {t['date']:<8} | {s['account_type']:<8} | ${t['amount']:>10,.2f} | {t['description']}")
