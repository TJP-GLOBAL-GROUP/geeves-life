#!/usr/bin/env python3
"""
Improved Bank of America PDF parser.
Properly identifies accounts and handles multi-line transaction descriptions.
Format:
  Date         Description                                           Amount
  12/13/24     C143682 STARTOUT DES:DIR DEP  ...                    4,500.00
               ID:4462283648 PPD                                    (continuation)
"""
import subprocess, json, re, os
from datetime import datetime
from collections import defaultdict

BOA_PDF_DIR = '/home/ubuntu/tax_prep/boa_pdfs'

def parse_boa_pdf_v2(pdf_path):
    """Parse a Bank of America statement PDF with proper account identification."""
    result = subprocess.run(['pdftotext', '-layout', pdf_path, '-'], capture_output=True, text=True)
    text = result.stdout
    lines = text.split('\n')
    
    # Extract account number from the "Account #" line (most reliable)
    account_number = None
    account_type = None
    period_start = None
    period_end = None
    
    for line in lines:
        # Full account number pattern: "Account # XXXX XXXX XXXX"
        acct_match = re.search(r'Account\s*#\s*(\d{4}\s*\d{4}\s*\d{4})', line)
        if acct_match and not account_number:
            account_number = acct_match.group(1).replace(' ', '')
        
        # Account number in header: "Account number: XXXX XXXX"
        acct_match2 = re.search(r'Account number:\s*(\d{4}\s*\d{4})', line)
        if acct_match2 and not account_number:
            account_number = acct_match2.group(1).replace(' ', '')
        
        # Period
        period_match = re.search(r'for\s+(\w+ \d{1,2}, \d{4})\s+to\s+(\w+ \d{1,2}, \d{4})', line)
        if period_match:
            period_start = period_match.group(1)
            period_end = period_match.group(2)
        
        # Account type
        if 'Savings' in line and 'Your' in line:
            account_type = 'savings'
        elif 'Banking' in line and 'Your' in line:
            account_type = 'checking'
    
    # Determine year from period
    year = None
    if period_end:
        try:
            end_date = datetime.strptime(period_end, '%B %d, %Y')
            year = end_date.year
        except:
            pass
    
    # Parse transactions
    transactions = []
    in_deposits = False
    in_withdrawals = False
    current_section = None
    
    # Transaction line pattern: MM/DD/YY followed by description and amount
    txn_pattern = re.compile(r'^(\d{2}/\d{2}/\d{2})\s+(.+?)\s+([-]?[\d,]+\.\d{2})\s*$')
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Detect section headers
        if 'Deposits and other additions' in stripped:
            current_section = 'deposit'
            continue
        elif 'Withdrawals and other subtractions' in stripped or 'Other subtractions' in stripped:
            current_section = 'withdrawal'
            continue
        elif 'Total deposits' in stripped or 'Total withdrawals' in stripped:
            continue
        elif stripped.startswith('Date') and 'Description' in stripped:
            continue
        
        if not current_section:
            continue
        
        # Try to match a transaction line
        match = txn_pattern.match(stripped)
        if match:
            date_str = match.group(1)
            description = match.group(2).strip()
            amount_str = match.group(3).replace(',', '')
            
            try:
                amount = float(amount_str)
            except ValueError:
                continue
            
            # Make withdrawals negative if not already
            if current_section == 'withdrawal' and amount > 0:
                amount = -amount
            
            # Parse date
            try:
                txn_date = datetime.strptime(date_str, '%m/%d/%y')
            except:
                continue
            
            transactions.append({
                'date': txn_date.strftime('%Y-%m-%d'),
                'description': description,
                'amount': amount,
                'section': current_section,
                'account_number': account_number,
                'account_type': account_type,
            })
    
    return {
        'account_number': account_number,
        'account_type': account_type,
        'period_start': period_start,
        'period_end': period_end,
        'year': year,
        'transactions': transactions,
        'filename': os.path.basename(pdf_path),
    }


def main():
    print("=" * 60)
    print("BANK OF AMERICA PARSER v2")
    print("=" * 60)
    
    pdfs = sorted(os.listdir(BOA_PDF_DIR))
    print(f"\nParsing {len(pdfs)} PDFs...")
    
    all_results = []
    seen_periods = set()
    
    for pdf in pdfs:
        path = os.path.join(BOA_PDF_DIR, pdf)
        result = parse_boa_pdf_v2(path)
        
        # Dedup by account + period
        period_key = f"{result['account_number']}_{result['period_start']}_{result['period_end']}"
        if period_key in seen_periods:
            continue
        seen_periods.add(period_key)
        
        all_results.append(result)
        txn_count = len(result['transactions'])
        if txn_count > 0:
            print(f"  {pdf[:50]:<50} | Acct {result['account_number'] or '???':<14} | {result['account_type'] or '?':<8} | {txn_count:>3} txns")
    
    # Aggregate
    all_transactions = []
    by_account = defaultdict(list)
    
    for r in all_results:
        for t in r['transactions']:
            t['source_file'] = r['filename']
            all_transactions.append(t)
            acct = t['account_number'] or 'unknown'
            by_account[acct].append(t)
    
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total unique statements: {len(all_results)}")
    print(f"Total transactions: {len(all_transactions)}")
    
    print(f"\nBy Account:")
    for acct in sorted(by_account.keys()):
        txns = by_account[acct]
        deposits = [t for t in txns if t['amount'] > 0]
        withdrawals = [t for t in txns if t['amount'] < 0]
        total_in = sum(t['amount'] for t in deposits)
        total_out = sum(abs(t['amount']) for t in withdrawals)
        print(f"\n  Account ...{acct[-4:] if len(acct) >= 4 else acct}")
        print(f"    Deposits: {len(deposits)} | ${total_in:,.2f}")
        print(f"    Withdrawals: {len(withdrawals)} | ${total_out:,.2f}")
        
        # Date range
        dates = [t['date'] for t in txns if t['date']]
        if dates:
            print(f"    Date range: {min(dates)} to {max(dates)}")
    
    # Save
    with open('/home/ubuntu/tax_prep/boa_transactions_v2.json', 'w') as f:
        json.dump(all_transactions, f, indent=2)
    
    print(f"\nSaved {len(all_transactions)} transactions to boa_transactions_v2.json")
    
    # Show sample deposits (looking for salary, Zelle from Maxfield)
    print(f"\n\nSAMPLE DEPOSITS (looking for patterns):")
    deposits = [t for t in all_transactions if t['amount'] > 0]
    deposits.sort(key=lambda x: x['amount'], reverse=True)
    for t in deposits[:20]:
        print(f"  {t['date']} | {t['description'][:60]:<60} | ${t['amount']:>10,.2f} | Acct ...{(t['account_number'] or '?')[-4:]}")
    
    print(f"\n\nSAMPLE WITHDRAWALS (looking for patterns):")
    withdrawals = [t for t in all_transactions if t['amount'] < 0]
    withdrawals.sort(key=lambda x: x['amount'])
    for t in withdrawals[:20]:
        print(f"  {t['date']} | {t['description'][:60]:<60} | ${t['amount']:>10,.2f} | Acct ...{(t['account_number'] or '?')[-4:]}")


if __name__ == '__main__':
    main()
