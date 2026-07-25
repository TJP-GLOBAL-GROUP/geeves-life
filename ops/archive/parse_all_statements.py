"""
Parse all Scotiabank credit card statements (2024 and 2025) to extract
Artiste's Boutique / 7 Dillsbury Avenue property-related transactions.

Statement format:
  TRANSACTION DATE    POSTING DATE    REFERENCE NO.    DESCRIPTION    DEBIT/CREDIT AMOUNT
  27-Dec-2023         27-Dec-2023     0632903835       OVERLIMIT FEE  $2,575.11
"""

import os
import re
import json
import subprocess
from datetime import datetime
from collections import defaultdict

# ─── Property-related keywords ────────────────────────────────────────────────
PROPERTY_KEYWORDS = {
    'JPS': ('UTILITIES', 'JPS'),
    'JAMAICA PUBLIC SERVICE': ('UTILITIES', 'JPS'),
    'NWC': ('UTILITIES', 'NWC'),
    'NATIONAL WATER': ('UTILITIES', 'NWC'),
    'WATER COMMISSION': ('UTILITIES', 'NWC'),
    'DIGICEL': ('UTILITIES', 'Digicel'),
    'FLOW': ('UTILITIES', 'Flow'),
    'BILL EXPRESS': ('UTILITIES', 'Bill Express'),
    'CLEANING': ('CLEANING FEE', 'Cleaning Staff'),
    'CLEANER': ('CLEANING FEE', 'Cleaning Staff'),
    'HOUSEKEEPER': ('CLEANING FEE', 'Cleaning Staff'),
    'POOL': ('MAINTENANCE', 'Pool Service'),
    'LANDSCAP': ('MAINTENANCE', 'Landscaping'),
    'GARDEN': ('MAINTENANCE', 'Garden Service'),
    'HOME AND GARDEN': ('MAINTENANCE', 'Home and Garden'),
    'MAINTENANCE': ('MAINTENANCE', 'Maintenance'),
    'PLUMBER': ('MAINTENANCE', 'Plumber'),
    'ELECTRICIAN': ('MAINTENANCE', 'Electrician'),
    'HANDYMAN': ('MAINTENANCE', 'Handyman'),
    'REPAIR': ('MAINTENANCE', 'Repair'),
    'INSURANCE': ('INSURANCE', 'Insurance'),
    'SAGICOR': ('INSURANCE', 'Sagicor'),
    'GUARDIAN LIFE': ('INSURANCE', 'Guardian Life'),
    'ADVANTAGE GENERAL': ('INSURANCE', 'Advantage General'),
    'FIXTURES': ('FIXTURES AND FITTINGS', 'Hardware Store'),
    'FITTINGS': ('FIXTURES AND FITTINGS', 'Hardware Store'),
    'HOME DEPOT': ('FIXTURES AND FITTINGS', 'Home Depot'),
    'ELECTRICAL DEPOT': ('FIXTURES AND FITTINGS', 'Electrical Depot'),
    'HARDWARE': ('FIXTURES AND FITTINGS', 'Hardware Store'),
    'BUILDING SUPPLY': ('FIXTURES AND FITTINGS', 'Building Supply'),
    'SUPERIOR PARTS': ('FIXTURES AND FITTINGS', 'Superior Parts'),
    'PRICESMART': ('CLEANING SUPPLIES', 'PriceSmart'),
    'PRICE SMART': ('CLEANING SUPPLIES', 'PriceSmart'),
    'AIRBNB': ('INCOME', 'Airbnb'),
    'BOOKING.COM': ('INCOME', 'Booking.com'),
    'DILLSBURY': ('OTHER', 'Dillsbury Ave'),
    'ARTISTE': ('OTHER', 'Artiste\'s Boutique'),
    'CARIBBEAN PROPERTY': ('MANAGEMENT FEE', 'Caribbean Property Mgr'),
    'PROPERTY MGR': ('MANAGEMENT FEE', 'Property Manager'),
}

# Keywords that are clearly NOT property-related (to reduce false positives)
EXCLUDE_KEYWORDS = [
    'OVERLIMIT FEE', 'DEBIT INTEREST', 'INTEREST CHARGES', 'GCT - GOVERNMENT',
    'INSURANCE PREMIUMS & CREDIT', 'TAXES', 'SCOTIAPOINTS', 'CASH ADVANCE',
    'NGIMMIGRATION', 'IMMIGRATION', 'VISA', 'TRAVEL', 'AIRLINE', 'HOTEL',
    'RESTAURANT', 'FOOD', 'GROCERY', 'SUPERMARKET', 'PHARMACY', 'MEDICAL',
    'PAYCOM NIGERIA', 'ABUJA', 'NIGERIA', 'TEXACO', 'GAS STATION', 'PETROL',
    'CRAZY SILK', 'DOCUMENT VOYAGE',
]


def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdftotext with layout preservation."""
    result = subprocess.run(
        ['pdftotext', '-layout', pdf_path, '-'],
        capture_output=True, text=True
    )
    return result.stdout


def parse_scotiabank_statement(text, filename):
    """Parse Scotiabank credit card statement and extract transactions."""
    transactions = []
    lines = text.split('\n')
    
    # Detect card number and statement period
    card_number = None
    stmt_period = None
    
    for line in lines[:30]:
        m = re.search(r'\*+(\d{4})', line)
        if m:
            card_number = m.group(1)
        m = re.search(r'(\w+ \d+\s*[-–]\s*\w+ \d+,?\s*\d{4})', line)
        if m:
            stmt_period = m.group(1)
    
    # Find transaction lines
    # Format: DATE1  DATE2  REF#  DESCRIPTION  AMOUNT
    # The layout-preserved text has lots of spaces
    
    # Pattern for transaction lines:
    # "  DD-MMM-YYYY    DD-MMM-YYYY    0123456789    DESCRIPTION    $X,XXX.XX"
    txn_pattern = re.compile(
        r'(\d{2}-\w{3}-\d{4})\s+(\d{2}-\w{3}-\d{4})\s+(\d{7,10})\s+(.+?)\s+(\$?-?[\d,]+\.\d{2})\s*$'
    )
    
    # Alternative pattern for lines that span multiple lines
    date_pattern = re.compile(r'(\d{2}-\w{3}-\d{4})')
    amount_pattern = re.compile(r'(\$?-?[\d,]+\.\d{2})\s*$')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Try to match full transaction line
        m = txn_pattern.search(line)
        if m:
            txn_date, post_date, ref_no, desc, amount = m.groups()
            
            # Check if description continues on next line(s)
            j = i + 1
            while j < len(lines) and j < i + 3:
                next_line = lines[j].strip()
                if next_line and not date_pattern.search(next_line) and not re.match(r'^\d{7,10}', next_line.strip()):
                    # Continuation of description
                    if not amount_pattern.search(next_line):
                        desc = desc + ' ' + next_line
                        j += 1
                    else:
                        break
                else:
                    break
            
            transactions.append({
                'txn_date': txn_date,
                'post_date': post_date,
                'ref_no': ref_no,
                'description': desc.strip(),
                'amount': amount.replace('$', '').replace(',', ''),
                'card': card_number,
                'stmt_period': stmt_period,
                'source_file': filename,
            })
            i = j
            continue
        
        i += 1
    
    return transactions


def is_property_related(description):
    """Check if a transaction is related to Artiste's Boutique property."""
    desc_upper = description.upper()
    
    # Check exclusions first
    for excl in EXCLUDE_KEYWORDS:
        if excl in desc_upper:
            return False, None, None
    
    # Check property keywords
    for kw, (category, paid_to) in PROPERTY_KEYWORDS.items():
        if kw in desc_upper:
            return True, category, paid_to
    
    return False, None, None


def parse_date(date_str):
    """Parse date string like '05-Jan-2024' to 'YYYY-MM-DD'."""
    try:
        dt = datetime.strptime(date_str.strip(), '%d-%b-%Y')
        return dt.strftime('%Y-%m-%d'), dt.year, dt.month
    except ValueError:
        try:
            dt = datetime.strptime(date_str.strip(), '%d-%b-%y')
            return dt.strftime('%Y-%m-%d'), dt.year, dt.month
        except ValueError:
            return date_str, None, None


def get_month_from_filename(filename):
    """Extract year and month from filename like 'January2024e-statement.pdf'."""
    months = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12
    }
    fn_lower = filename.lower()
    for month_name, month_num in months.items():
        if fn_lower.startswith(month_name):
            year_m = re.search(r'(\d{4})', filename)
            if year_m:
                return int(year_m.group(1)), month_num
    return None, None


def main():
    upload_dir = '/home/ubuntu/upload'
    
    # Find all bank statement PDFs
    pdf_files = sorted([
        f for f in os.listdir(upload_dir)
        if f.endswith('.pdf') and 'e-statement' in f.lower()
    ])
    
    print(f'Found {len(pdf_files)} bank statement PDFs')
    
    all_transactions = []
    property_transactions = []
    errors = []
    
    for filename in pdf_files:
        pdf_path = os.path.join(upload_dir, filename)
        file_year, file_month = get_month_from_filename(filename)
        
        try:
            text = extract_pdf_text(pdf_path)
            if not text.strip():
                print(f'  SKIP (no text): {filename}')
                continue
            
            txns = parse_scotiabank_statement(text, filename)
            all_transactions.extend(txns)
            
            # Filter for property-related transactions
            prop_txns = []
            for txn in txns:
                is_prop, category, paid_to = is_property_related(txn['description'])
                if is_prop:
                    date_str, year, month = parse_date(txn['txn_date'])
                    if not year:
                        year = file_year
                        month = file_month
                    
                    amount_val = float(txn['amount'].replace(',', '').replace('-', ''))
                    is_credit = txn['amount'].startswith('-')
                    
                    prop_txns.append({
                        'date': date_str,
                        'year': year,
                        'month': month,
                        'description': txn['description'],
                        'category': category,
                        'paid_to': paid_to,
                        'amount_jmd': amount_val,
                        'is_credit': is_credit,
                        'card': txn['card'],
                        'source_file': filename,
                        'ref_no': txn['ref_no'],
                    })
            
            if prop_txns:
                print(f'  {filename}: {len(txns)} txns, {len(prop_txns)} property-related')
                property_transactions.extend(prop_txns)
            else:
                print(f'  {filename}: {len(txns)} txns, 0 property-related')
                
        except Exception as e:
            print(f'  ERROR {filename}: {e}')
            errors.append({'file': filename, 'error': str(e)})
    
    # Save results
    output = {
        'total_files': len(pdf_files),
        'total_transactions': len(all_transactions),
        'property_transactions': len(property_transactions),
        'errors': errors,
        'transactions': property_transactions,
    }
    
    with open('/home/ubuntu/upload/property_transactions.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f'\n=== SUMMARY ===')
    print(f'Total files: {len(pdf_files)}')
    print(f'Total transactions parsed: {len(all_transactions)}')
    print(f'Property-related transactions: {len(property_transactions)}')
    print(f'Errors: {len(errors)}')
    
    # Group by year and category
    by_year_cat = defaultdict(lambda: defaultdict(list))
    for txn in property_transactions:
        yr = txn.get('year') or 'unknown'
        by_year_cat[yr][txn['category']].append(txn)
    
    for yr in sorted(by_year_cat.keys()):
        print(f'\n{yr}:')
        for cat in sorted(by_year_cat[yr].keys()):
            txns = by_year_cat[yr][cat]
            total = sum(t['amount_jmd'] for t in txns if not t['is_credit'])
            print(f'  {cat}: {len(txns)} transactions, JMD ${total:,.2f}')
            for t in txns[:3]:
                print(f'    {t["date"]} | {t["description"][:60]} | ${t["amount_jmd"]:,.2f}')
    
    # Also show 2024 unlinked categories
    print('\n\n=== 2024 PROPERTY TRANSACTIONS BY MONTH ===')
    by_month = defaultdict(list)
    for txn in property_transactions:
        if txn.get('year') == 2024:
            by_month[txn.get('month', 0)].append(txn)
    
    for month in sorted(by_month.keys()):
        txns = by_month[month]
        print(f'\nMonth {month}:')
        for t in txns:
            print(f'  {t["date"]} | {t["category"]} | {t["description"][:50]} | ${t["amount_jmd"]:,.2f}')


if __name__ == '__main__':
    main()
