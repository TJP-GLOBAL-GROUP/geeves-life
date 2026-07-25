"""
Parse all bank statements (2024 and 2025) to extract Artiste's Boutique transactions.
Uses the Forge API to get presigned download URLs, then extracts PDF text.

Artiste's Boutique is at 7 Dillsbury Avenue, Kingston, Jamaica.
We're looking for:
- JPS light bill payments
- NWC water bill payments  
- Cleaning fee payments
- Maintenance/repair payments
- Insurance payments
- Any other property-related expenses
"""

import os
import json
import re
import subprocess
import tempfile
import requests
from datetime import datetime
from collections import defaultdict

FORGE_URL = os.environ.get('BUILT_IN_FORGE_API_URL', 'https://forge.manus.ai')
FORGE_KEY = os.environ.get('BUILT_IN_FORGE_API_KEY', '')

def get_download_url(s3_key):
    """Get a presigned download URL from the Forge API."""
    url = f"{FORGE_URL.rstrip('/')}/v1/storage/downloadUrl"
    resp = requests.get(url, params={'path': s3_key}, headers={'Authorization': f'Bearer {FORGE_KEY}'})
    resp.raise_for_status()
    return resp.json()['url']

def download_pdf(download_url, output_path):
    """Download a PDF from a presigned URL."""
    resp = requests.get(download_url, timeout=30)
    resp.raise_for_status()
    with open(output_path, 'wb') as f:
        f.write(resp.content)
    return len(resp.content)

def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdftotext."""
    result = subprocess.run(
        ['pdftotext', '-layout', pdf_path, '-'],
        capture_output=True, text=True
    )
    return result.stdout

def parse_ncb_statement(text, year, month):
    """Parse NCB bank statement format."""
    transactions = []
    lines = text.split('\n')
    
    # NCB format: Date | Description | Debit | Credit | Balance
    # Look for transaction lines
    date_pattern = re.compile(r'^\s*(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}/\d{1,2}/\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*$')
    
    # Also look for patterns like: DD MMM  Description  Amount
    ncb_pattern = re.compile(r'(\d{2}\s+\w{3})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})?')
    
    for line in lines:
        # Skip empty lines
        if not line.strip():
            continue
        
        # Try to match transaction lines
        m = ncb_pattern.match(line)
        if m:
            date_str, desc, amount1, amount2 = m.groups()
            transactions.append({
                'date_str': date_str,
                'description': desc.strip(),
                'amount': amount1,
                'year': year,
                'month': month,
                'raw_line': line.strip()
            })
    
    return transactions

def parse_statement_generic(text, year, month, filename):
    """Generic parser for bank statements - looks for property-related transactions."""
    transactions = []
    lines = text.split('\n')
    
    # Keywords that indicate property-related expenses for Artiste's Boutique
    property_keywords = [
        'JPS', 'JAMAICA PUBLIC SERVICE', 'LIGHT BILL', 'ELECTRICITY',
        'NWC', 'NATIONAL WATER', 'WATER BILL', 'WATER COMMISSION',
        'CLEANING', 'CLEANER', 'HOUSEKEEPER',
        'MAINTENANCE', 'REPAIR', 'PLUMBER', 'ELECTRICIAN', 'HANDYMAN',
        'INSURANCE', 'SAGICOR', 'GUARDIAN LIFE', 'ADVANTAGE GENERAL',
        'POOL', 'LANDSCAP', 'GARDEN',
        'FIXTURES', 'FITTINGS', 'HOME DEPOT', 'ELECTRICAL DEPOT',
        'HARDWARE', 'BUILDING SUPPLY',
        'DILLSBURY', 'ARTISTE', 'BOUTIQUE',
        'PROPERTY', 'RENTAL', 'AIRBNB', 'BOOKING.COM',
        'DIGICEL', 'FLOW', 'INTERNET', 'CABLE',
    ]
    
    # Date patterns
    date_patterns = [
        re.compile(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'),
        re.compile(r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})', re.IGNORECASE),
        re.compile(r'(\d{2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))', re.IGNORECASE),
    ]
    
    # Amount pattern - JMD amounts
    amount_pattern = re.compile(r'([\d,]+\.\d{2})')
    
    for i, line in enumerate(lines):
        line_upper = line.upper()
        
        # Check if line contains property-related keyword
        matched_keyword = None
        for kw in property_keywords:
            if kw in line_upper:
                matched_keyword = kw
                break
        
        if not matched_keyword:
            continue
        
        # Try to extract date
        date_str = None
        for dp in date_patterns:
            m = dp.search(line)
            if m:
                date_str = m.group(1)
                break
        
        # If no date on this line, check previous lines
        if not date_str:
            for j in range(max(0, i-2), i):
                for dp in date_patterns:
                    m = dp.search(lines[j])
                    if m:
                        date_str = m.group(1)
                        break
                if date_str:
                    break
        
        # Extract amounts
        amounts = amount_pattern.findall(line)
        
        if amounts or date_str:
            transactions.append({
                'date_str': date_str or f'{month:02d}/01/{year}',
                'description': line.strip(),
                'amounts': amounts,
                'keyword': matched_keyword,
                'year': year,
                'month': month,
                'source_file': filename,
                'raw_line': line.strip()
            })
    
    return transactions

def categorize_transaction(description, amounts):
    """Categorize a transaction based on description."""
    desc_upper = description.upper()
    
    # Determine category
    if any(k in desc_upper for k in ['JPS', 'JAMAICA PUBLIC SERVICE', 'LIGHT BILL', 'ELECTRICITY']):
        category = 'UTILITIES'
        paid_to = 'JPS'
    elif any(k in desc_upper for k in ['NWC', 'NATIONAL WATER', 'WATER COMMISSION']):
        category = 'UTILITIES'
        paid_to = 'NWC'
    elif any(k in desc_upper for k in ['DIGICEL', 'FLOW', 'INTERNET', 'CABLE']):
        category = 'UTILITIES'
        paid_to = 'Digicel' if 'DIGICEL' in desc_upper else 'Flow'
    elif any(k in desc_upper for k in ['CLEANING', 'CLEANER', 'HOUSEKEEPER']):
        category = 'CLEANING FEE'
        paid_to = 'Cleaning Staff'
    elif any(k in desc_upper for k in ['POOL', 'LANDSCAP', 'GARDEN']):
        category = 'MAINTENANCE'
        paid_to = 'Pool/Garden Service'
    elif any(k in desc_upper for k in ['MAINTENANCE', 'REPAIR', 'PLUMBER', 'ELECTRICIAN', 'HANDYMAN']):
        category = 'MAINTENANCE'
        paid_to = 'Maintenance'
    elif any(k in desc_upper for k in ['INSURANCE', 'SAGICOR', 'GUARDIAN', 'ADVANTAGE']):
        category = 'INSURANCE'
        paid_to = 'Insurance'
    elif any(k in desc_upper for k in ['FIXTURES', 'FITTINGS', 'HOME DEPOT', 'ELECTRICAL DEPOT', 'HARDWARE']):
        category = 'FIXTURES AND FITTINGS'
        paid_to = 'Hardware Store'
    elif any(k in desc_upper for k in ['AIRBNB', 'BOOKING.COM', 'RENTAL']):
        category = 'INCOME'
        paid_to = 'Airbnb/Booking'
    else:
        category = 'OTHER'
        paid_to = 'Unknown'
    
    # Extract best amount (usually the debit amount)
    amount = None
    if amounts:
        # Take the first amount that looks reasonable (not a balance)
        for amt_str in amounts:
            amt = float(amt_str.replace(',', ''))
            if 1000 <= amt <= 500000:  # Reasonable range for JMD property expenses
                amount = amt_str
                break
        if not amount:
            amount = amounts[0]
    
    return category, paid_to, amount

def parse_date_string(date_str, year, month):
    """Parse various date string formats."""
    if not date_str:
        return f'{year}-{month:02d}-01'
    
    # Try various formats
    formats = [
        '%d/%m/%Y', '%d/%m/%y', '%d-%m-%Y', '%d-%m-%y',
        '%d %b %Y', '%d %b %y', '%d %B %Y',
        '%d %b', '%d%b',
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.year < 2000:
                dt = dt.replace(year=year)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    # Try to extract day and month
    m = re.search(r'(\d{1,2})', date_str)
    if m:
        day = int(m.group(1))
        if 1 <= day <= 31:
            return f'{year}-{month:02d}-{day:02d}'
    
    return f'{year}-{month:02d}-01'

def main():
    # Load bank statements list
    with open('/home/ubuntu/upload/bank_statements_list.json') as f:
        statements = json.load(f)
    
    print(f'Processing {len(statements)} bank statements...')
    
    all_transactions = []
    errors = []
    
    # Create temp directory for PDFs
    os.makedirs('/home/ubuntu/upload/bank_pdfs', exist_ok=True)
    
    for i, stmt in enumerate(statements):
        filename = stmt['originalFilename']
        s3_key = stmt['s3Url'].replace('https://geeveshop-mhfpbzgg.manus.space/', '')
        year = stmt['statementYear']
        month = stmt['statementMonth']
        
        print(f'\n[{i+1}/{len(statements)}] Processing {filename} ({year}-{month:02d})...')
        
        try:
            # Get presigned download URL
            download_url = get_download_url(s3_key)
            
            # Download PDF
            pdf_path = f'/home/ubuntu/upload/bank_pdfs/{filename}'
            size = download_pdf(download_url, pdf_path)
            print(f'  Downloaded: {size:,} bytes')
            
            if size < 1000:
                print(f'  WARNING: File too small, skipping')
                continue
            
            # Extract text
            text = extract_pdf_text(pdf_path)
            if not text.strip():
                print(f'  WARNING: No text extracted, skipping')
                continue
            
            print(f'  Text length: {len(text):,} chars')
            
            # Parse for property-related transactions
            transactions = parse_statement_generic(text, year, month, filename)
            print(f'  Property transactions found: {len(transactions)}')
            
            for txn in transactions:
                category, paid_to, amount = categorize_transaction(
                    txn['description'], txn.get('amounts', [])
                )
                
                parsed_date = parse_date_string(txn['date_str'], year, month)
                
                all_transactions.append({
                    'date': parsed_date,
                    'year': year,
                    'month': month,
                    'description': txn['description'][:200],
                    'category': category,
                    'paid_to': paid_to,
                    'amount': amount,
                    'amounts_found': txn.get('amounts', []),
                    'keyword': txn.get('keyword', ''),
                    'source_file': filename,
                    'source_url': stmt['s3Url'],
                })
            
        except Exception as e:
            print(f'  ERROR: {e}')
            errors.append({'file': filename, 'error': str(e)})
    
    # Save results
    output = {
        'total_statements': len(statements),
        'total_transactions': len(all_transactions),
        'errors': errors,
        'transactions': all_transactions,
    }
    
    with open('/home/ubuntu/upload/bank_transactions.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f'\n=== SUMMARY ===')
    print(f'Total statements processed: {len(statements)}')
    print(f'Total property transactions found: {len(all_transactions)}')
    print(f'Errors: {len(errors)}')
    
    # Group by year and category
    by_year_cat = defaultdict(lambda: defaultdict(list))
    for txn in all_transactions:
        by_year_cat[txn['year']][txn['category']].append(txn)
    
    for yr in sorted(by_year_cat.keys()):
        print(f'\n{yr}:')
        for cat in sorted(by_year_cat[yr].keys()):
            txns = by_year_cat[yr][cat]
            print(f'  {cat}: {len(txns)} transactions')

if __name__ == '__main__':
    main()
