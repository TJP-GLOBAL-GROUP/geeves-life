#!/usr/bin/env python3
"""
Parse all Bank of America Business Statement PDFs.
Format: MAXFIELD MARKET GLOBAL LLC, Account # 8981 0415 2448 (checking)
Also has card transactions (card # 1887).

Sections:
- Deposits and other credits (positive)
- Withdrawals and other debits (negative)
- Card account transactions (negative, under card #)
- Service fees (negative)
"""
import subprocess, json, os, re, glob
from datetime import datetime

DOWNLOAD_DIR = '/home/ubuntu/tax_prep/biz_statements'


def parse_biz_pdf(filepath):
    """Parse a BoA business checking statement PDF."""
    result = subprocess.run(['pdftotext', '-layout', filepath, '-'], capture_output=True, text=True)
    text = result.stdout
    lines = text.split('\n')
    
    transactions = []
    account_number = None
    statement_period = None
    
    # Extract account info from header
    for line in lines[:60]:
        m = re.search(r'Account\s*#\s*([\d\s]+)', line)
        if m and not account_number:
            account_number = m.group(1).replace(' ', '')
        # Period: "January 1, 2025 to January 31, 2025"
        m = re.search(r'(\w+ \d+, \d{4})\s+to\s+(\w+ \d+, \d{4})', line)
        if m:
            statement_period = f"{m.group(1)} to {m.group(2)}"
    
    # Determine year from filename
    year_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', os.path.basename(filepath))
    default_year = year_match.group(1) if year_match else '2025'
    
    # State machine for sections
    section = None  # 'deposits', 'withdrawals', 'card', 'fees'
    current_card = None
    
    # Transaction pattern: date at start, amount at end
    # Date: MM/DD/YY
    # Amount: number with optional comma, decimal, at end of line
    txn_pattern = re.compile(r'^\s*(\d{2}/\d{2}/\d{2})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})\s*$')
    
    # Continuation line (no date, just description, possibly with amount)
    cont_pattern = re.compile(r'^\s{10,}(.+?)\s{2,}(-?[\d,]+\.\d{2})\s*$')
    cont_desc_only = re.compile(r'^\s{10,}(\S.+)$')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Section detection
        if re.match(r'^Deposits and other credits', stripped):
            section = 'deposits'
            i += 1
            # Skip header line "Date  Description  Amount"
            if i < len(lines) and 'Date' in lines[i] and 'Description' in lines[i]:
                i += 1
            continue
        elif re.match(r'^Withdrawals and other debits', stripped):
            section = 'withdrawals'
            i += 1
            if i < len(lines) and 'Date' in lines[i] and 'Description' in lines[i]:
                i += 1
            continue
        elif re.match(r'^Card account #', stripped):
            section = 'card'
            card_match = re.search(r'(\d{4})\s*$', stripped)
            current_card = card_match.group(1) if card_match else 'unknown'
            i += 1
            continue
        elif re.match(r'^Service fees', stripped):
            section = 'fees'
            i += 1
            continue
        elif re.match(r'^(Total|Subtotal)', stripped):
            i += 1
            continue
        elif re.match(r'^Daily ledger balances', stripped) or re.match(r'^Note your', stripped):
            section = None
            i += 1
            continue
        elif 'continued on the next page' in stripped:
            i += 1
            continue
        elif re.match(r'^MAXFIELD MARKET', stripped):
            i += 1
            continue
        elif stripped.startswith('Date') and 'Description' in stripped:
            i += 1
            continue
        
        if section is None:
            i += 1
            continue
        
        # Try to match a transaction line
        m = txn_pattern.match(line)
        if m:
            date_str = m.group(1)
            desc = m.group(2).strip()
            amount_str = m.group(3).replace(',', '')
            amount = float(amount_str)
            
            # Collect continuation lines
            while i + 1 < len(lines):
                next_line = lines[i + 1]
                # Check if next line is a continuation (indented, no date)
                if re.match(r'^\s{10,}', next_line) and not txn_pattern.match(next_line):
                    cont_text = next_line.strip()
                    # Remove amount if present at end
                    cont_text = re.sub(r'\s+-?[\d,]+\.\d{2}\s*$', '', cont_text)
                    if cont_text and not cont_text.startswith('INTERNATIONAL TRANSACTION FEE'):
                        desc += ' ' + cont_text
                    i += 1
                else:
                    break
            
            # Clean up description
            desc = re.sub(r'\s+', ' ', desc).strip()
            # Remove card number references
            desc = re.sub(r'\s*XXXXXXXXXXXX\d{4}\s*', ' ', desc)
            desc = re.sub(r'\s*XXXX XXXX XXXX \d{4}\s*', ' ', desc)
            desc = re.sub(r'\s*CKCD\s*', ' ', desc)
            desc = re.sub(r'\s+', ' ', desc).strip()
            
            # Determine sign
            if section == 'deposits':
                amount = abs(amount)
            elif section in ('withdrawals', 'card', 'fees'):
                amount = -abs(amount)
            
            # Determine transaction type
            txn_type = 'deposit' if section == 'deposits' else 'withdrawal'
            if section == 'card':
                txn_type = 'card'
            elif section == 'fees':
                txn_type = 'fee'
            
            transactions.append({
                'date': date_str,
                'description': desc,
                'amount': amount,
                'type': txn_type,
                'card': current_card if section == 'card' else None,
                'account': account_number,
                'source_file': os.path.basename(filepath)
            })
        
        i += 1
    
    return transactions, account_number, statement_period


def main():
    print("=" * 60)
    print("PARSING ALL BUSINESS ACCOUNT STATEMENTS")
    print("=" * 60)
    
    pdf_files = sorted(glob.glob(os.path.join(DOWNLOAD_DIR, '*.pdf')))
    print(f"Found {len(pdf_files)} PDF files")
    
    all_transactions = []
    
    for filepath in pdf_files:
        txns, acct, period = parse_biz_pdf(filepath)
        print(f"  {os.path.basename(filepath):<40} | Acct: {acct} | Period: {period or 'N/A':<30} | {len(txns)} txns")
        all_transactions.extend(txns)
    
    print(f"\nTotal transactions parsed: {len(all_transactions)}")
    
    # Summary
    deposits = [t for t in all_transactions if t['amount'] > 0]
    withdrawals = [t for t in all_transactions if t['amount'] < 0]
    
    print(f"  Deposits: {len(deposits)} totaling ${sum(t['amount'] for t in deposits):,.2f}")
    print(f"  Withdrawals: {len(withdrawals)} totaling ${sum(t['amount'] for t in withdrawals):,.2f}")
    
    # Show top descriptions by frequency
    from collections import Counter
    desc_counter = Counter()
    for t in all_transactions:
        # Normalize description for counting
        desc = t['description'][:60]
        desc_counter[desc] += 1
    
    print(f"\n  Top 30 recurring descriptions:")
    for desc, count in desc_counter.most_common(30):
        total = sum(t['amount'] for t in all_transactions if t['description'][:60] == desc)
        print(f"    {count:>3}x | ${total:>12,.2f} | {desc}")
    
    # Save to JSON for next step
    with open('/home/ubuntu/tax_prep/biz_transactions_parsed.json', 'w') as f:
        json.dump(all_transactions, f, indent=2)
    
    print(f"\nSaved to biz_transactions_parsed.json")


if __name__ == '__main__':
    main()
