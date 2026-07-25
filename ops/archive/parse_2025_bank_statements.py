"""
Parse all 2025 Scotiabank statements to find Artiste's Boutique / property-related transactions.
Looks for: JPS, NWC, Courtney Robinson, cleaning, repair, maintenance, property tax,
           hardware stores, plumbing, electrical, PriceSmart, etc.
"""
import subprocess
import re
import json
from pathlib import Path
from collections import defaultdict

UPLOAD_DIR = Path('/home/ubuntu/upload')

# Keywords that indicate property expenses
PROPERTY_KEYWORDS = [
    r'jps', r'nwc', r'courtney', r'robinson', r'cleaning', r'repair',
    r'maintenance', r'hardware', r'plumbing', r'electrical', r'pricesmart',
    r'price smart', r'dillsbury', r'artiste', r'boutique', r'property tax',
    r'fixtures', r'furniture', r'lumber', r'paint', r'tiles', r'cement',
    r'glazing', r'glass', r'carpet', r'curtain', r'bedding', r'linen',
    r'airbnb', r'vrbo', r'booking', r'caretaker', r'handyman',
    r'scotiabank transfer', r'ach transfer', r'online transfer',
    r'ncb', r'bill express', r'billexpress', r'digicel', r'flow',
    r'mortgage', r'insurance', r'guardian', r'sagicor',
]

# Month name to number
MONTH_MAP = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
}

def extract_text(pdf_path):
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(pdf_path), '-'],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout
    except Exception as e:
        return ''

def parse_transactions(text, month, year, source_file):
    """Parse Scotiabank credit card statement transactions."""
    transactions = []
    lines = text.split('\n')
    
    # Scotiabank statement format:
    # DATE    DESCRIPTION                    AMOUNT
    # e.g.: Jan 15  COURTNEY ROBINSON TRANSFER    40,000.00
    
    # Pattern for transaction lines
    # Date patterns: "Jan 15", "15 Jan", "01/15"
    date_pattern = re.compile(
        r'(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{2}/\d{2})',
        re.IGNORECASE
    )
    
    # Amount pattern: numbers with commas and decimal
    amount_pattern = re.compile(r'[\$\s]?([\d,]+\.\d{2})\s*(?:CR|DR)?', re.IGNORECASE)
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        
        # Check if any property keyword matches
        matched_keyword = None
        for kw in PROPERTY_KEYWORDS:
            if re.search(kw, line_lower):
                matched_keyword = kw
                break
        
        if not matched_keyword:
            continue
        
        # Try to extract amount from this line or nearby lines
        amount = 0
        amounts = amount_pattern.findall(line)
        if amounts:
            # Take the last amount (usually the transaction amount)
            try:
                amount = float(amounts[-1].replace(',', ''))
            except:
                pass
        
        # If no amount on this line, check next 2 lines
        if amount == 0:
            for j in range(1, 3):
                if i + j < len(lines):
                    next_amounts = amount_pattern.findall(lines[i + j])
                    if next_amounts:
                        try:
                            amount = float(next_amounts[-1].replace(',', ''))
                            break
                        except:
                            pass
        
        # Extract date from line
        date_match = date_pattern.search(line)
        trans_date = f'{year}-{month:02d}-01'  # default to first of month
        if date_match:
            date_str = date_match.group()
            # Parse the date
            for mon_name, mon_num in MONTH_MAP.items():
                if mon_name[:3].lower() in date_str.lower():
                    day_match = re.search(r'\d{1,2}', date_str)
                    if day_match:
                        day = int(day_match.group())
                        trans_date = f'{year}-{mon_num:02d}-{day:02d}'
                    break
        
        # Categorize based on keyword
        category = 'MAINTENANCE'
        if any(k in line_lower for k in ['cleaning', 'clean', 'sweep', 'wash', 'mop']):
            category = 'CLEANING FEE'
        elif any(k in line_lower for k in ['repair', 'fix', 'plumb', 'electric', 'glass', 'paint']):
            category = 'REPAIR COST'
        elif any(k in line_lower for k in ['jps', 'nwc', 'digicel', 'flow', 'bill express', 'utilities']):
            category = 'UTILITIES'
        elif any(k in line_lower for k in ['hardware', 'lumber', 'cement', 'tiles', 'pricesmart']):
            category = 'MAINTENANCE SUPPLIES'
        elif any(k in line_lower for k in ['furniture', 'bedding', 'linen', 'curtain', 'carpet']):
            category = 'ASSETS: FURNITURE'
        elif any(k in line_lower for k in ['insurance', 'guardian', 'sagicor']):
            category = 'ADMINISTRATIVE EXPENSE'
        elif any(k in line_lower for k in ['mortgage']):
            category = 'MORTGAGE PAYMENT'
        elif any(k in line_lower for k in ['property tax', 'tax']):
            category = 'PROPERTY TAX'
        
        transactions.append({
            'date': trans_date,
            'month': month,
            'year': year,
            'description': line.strip()[:100],
            'amount_jmd': amount,
            'category': category,
            'source_file': str(source_file),
            'matched_keyword': matched_keyword,
        })
    
    return transactions

# Process all 2025 statements
all_transactions = []
months_processed = set()

for month_name, month_num in MONTH_MAP.items():
    # Find all statement files for this month
    month_cap = month_name.capitalize()
    stmt_files = list(UPLOAD_DIR.glob(f'{month_cap}2025e-statement*.pdf'))
    
    if not stmt_files:
        continue
    
    for stmt_file in stmt_files:
        text = extract_text(stmt_file)
        if not text:
            continue
        
        transactions = parse_transactions(text, month_num, 2025, stmt_file.name)
        all_transactions.extend(transactions)
        months_processed.add(month_name)
        print(f'  {stmt_file.name}: {len(transactions)} property transactions')

print(f'\nTotal 2025 bank transactions found: {len(all_transactions)}')
print(f'Months processed: {sorted(months_processed)}')

# Deduplicate by date + amount + description similarity
seen = set()
unique_transactions = []
for t in all_transactions:
    key = (t['date'], t['amount_jmd'], t['description'][:30])
    if key not in seen:
        seen.add(key)
        unique_transactions.append(t)

print(f'After deduplication: {len(unique_transactions)} unique transactions')

# Show summary by category
from collections import Counter
cats = Counter(t['category'] for t in unique_transactions)
for cat, cnt in cats.most_common():
    total = sum(t['amount_jmd'] for t in unique_transactions if t['category'] == cat)
    print(f'  {cat}: {cnt} transactions | JMD ${total:,.0f}')

# Save
with open('/home/ubuntu/upload/bank_transactions_2025.json', 'w') as f:
    json.dump(unique_transactions, f, indent=2)

print('\nSaved to bank_transactions_2025.json')
