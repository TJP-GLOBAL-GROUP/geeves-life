#!/usr/bin/env python3
"""
Bank statement PDF parser for Scotiabank Jamaica statements.
Three account types:
  - No suffix = Scotia Day-to-Day Chequing #620505 (account_id=1)
  - (1) suffix = Scotia Gold Mastercard ****6376 (account_id=2)
  - (2) suffix = Scotia Aero Platinum Mastercard ****6138 (account_id=3)

Chequing format:
  30DEC  DESCRIPTION  J$ CREDIT +  J$ DEBIT -  J$ BALANCE
  02JAN  DESCRIPTION  J$ 70,182.36 +           J$ 50,681.23

Credit card format:
  10-Jan-2025  10-Jan-2025  1072731946  DESCRIPTION  $2,575.11
  (negative amounts = payments/credits)
"""

import os
import re
import json
import subprocess
from datetime import datetime
from pathlib import Path

UPLOAD_DIR = Path("/home/ubuntu/upload")
OUTPUT_FILE = UPLOAD_DIR / "parsed_transactions.json"
HOUSEHOLD_ID = "V8lk3KJatvxBTWURf4uo9"

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def pdf_to_text(pdf_path):
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True
    )
    return result.stdout

def identify_account(filename):
    """Identify account from filename suffix and year.
    
    2024 naming:
      no suffix = Gold Mastercard ****6376 (id=2)
      (1) suffix = Aero Platinum Mastercard ****6138 (id=3)
      (no chequing statements for 2024 uploaded)
    
    2025+ naming:
      no suffix = Chequing #620505 (id=1)
      (1) suffix = Gold Mastercard ****6376 (id=2)
      (2) suffix = Aero Platinum Mastercard ****6138 (id=3)
    """
    fname = Path(filename).name
    year_match = re.search(r'(20\d{2})', fname)
    year = int(year_match.group(1)) if year_match else 2025
    
    if year <= 2024:
        # 2024 naming convention
        if "(1)" in fname:
            return "aero_mastercard", 3
        else:
            # no suffix = Gold Mastercard
            return "gold_mastercard", 2
    else:
        # 2025+ naming convention
        if "(2)" in fname:
            return "aero_mastercard", 3
        elif "(1)" in fname:
            return "gold_mastercard", 2
        else:
            return "chequing", 1

def extract_statement_period(filename):
    """Extract year and month from filename like 'January2025e-statement.pdf'."""
    fname = Path(filename).stem.lower()
    for month_name, month_num in MONTH_MAP.items():
        if fname.startswith(month_name) or f"/{month_name}" in fname:
            year_match = re.search(r'(20\d{2})', fname)
            if year_match:
                return int(year_match.group(1)), month_num
    # fallback: search anywhere in filename
    for month_name, month_num in MONTH_MAP.items():
        if month_name in fname:
            year_match = re.search(r'(20\d{2})', fname)
            if year_match:
                return int(year_match.group(1)), month_num
    return None, None

def parse_chequing_date(date_str, statement_year, statement_month):
    """Parse chequing date format like '30DEC', '02JAN', '15JAN'."""
    m = re.match(r'(\d{2})([A-Za-z]{3})', date_str.strip())
    if not m:
        return None
    day = int(m.group(1))
    month_abbr = m.group(2).lower()
    month = MONTH_MAP.get(month_abbr)
    if not month:
        return None
    # Handle year rollover: if statement month is Jan and date is Dec, it's previous year
    year = statement_year
    if statement_month == 1 and month == 12:
        year = statement_year - 1
    elif statement_month == 12 and month == 1:
        year = statement_year + 1
    try:
        return datetime(year, month, day).isoformat()
    except ValueError:
        return None

def parse_credit_card_date(date_str, statement_year):
    """Parse credit card date format like '10-Jan-2025' or '31-Dec-2024'."""
    m = re.match(r'(\d{1,2})-([A-Za-z]{3})-(\d{4})', date_str.strip())
    if m:
        day = int(m.group(1))
        month_abbr = m.group(2).lower()
        year = int(m.group(3))
        month = MONTH_MAP.get(month_abbr)
        if month:
            try:
                return datetime(year, month, day).isoformat()
            except ValueError:
                return None
    return None

def parse_amount(amount_str):
    """Parse amount string like '$1,234.56' or '$-338,700.00' into float."""
    if not amount_str:
        return None
    s = amount_str.strip().replace(',', '').replace('$', '').replace('J$', '').replace('JMD', '').strip()
    try:
        return float(s)
    except ValueError:
        return None

def classify_vertical(description):
    """Auto-classify transaction vertical based on description keywords."""
    desc = description.upper()
    
    # Maxfield Bakery salary / payroll
    if any(k in desc for k in ["MAXFIELD", "BAKERY", "PAYROLL"]):
        return "maxfield_bakery", 90
    
    # Property utilities (JPS = Jamaica Public Service = electricity, NWC = water)
    if any(k in desc for k in ["JPS", "JPS-", "JAMAICA PUBLIC SERVICE", "NWC", "NATIONAL WATER",
                                 "DIGICEL", "FLOW ", "AIRBNB", "VRBO", "BOOKING.COM",
                                 "PROPERTY TAX", "STRATA", "BILL EXPRESS"]):
        return "artistes_boutique", 55  # default to artistes_boutique, can be reassigned
    
    # Tax payments
    if any(k in desc for k in ["TAX ADMINISTRATION", "TAX ADMIN", "TAJ "]):
        return "multi", 70
    
    # Loan payments (likely mortgage)
    if any(k in desc for k in ["LOAN PAYMENT", "MORTGAGE"]):
        return "artistes_boutique", 60
    
    # Bank fees
    if any(k in desc for k in ["LATE PAYMENT FEE", "OVERLIMIT FEE", "GCT", "SERVICE CHARGE",
                                 "LOAN LATE FEE", "DEBIT INTEREST", "INTEREST"]):
        return "personal", 75
    
    # Transfers
    if any(k in desc for k in ["THIRD PARTY", "TRANSFER", "ACH - CARD PAYMENT"]):
        return "personal", 60
    
    # Personal
    if any(k in desc for k in ["SUPERMARKET", "GROCERY", "RESTAURANT", "PHARMACY",
                                 "MEDICAL", "SCHOOL", "TUITION", "INSURANCE",
                                 "NETFLIX", "SPOTIFY", "AMAZON", "APPLE", "GOOGLE"]):
        return "personal", 80
    
    return "unclassified", 0

def parse_chequing_statement(text, year, month):
    """
    Parse chequing statement transactions.
    Format:
      30DEC    LOAN PAYMENT                    J$ 5,674.71 -    J$ 1,500.00
               1188764
      02JAN    SCOTIA DIRECT CREDIT    J$ 70,182.36 +
               1, MAXFIELD BAKERY 7110 Perma
    """
    transactions = []
    lines = text.split('\n')
    
    # Pattern: date at start (DDMMM), then description, then amounts
    # Date pattern: 2 digits + 3 letters, e.g. 30DEC, 02JAN
    date_pattern = re.compile(r'^\s{0,10}(\d{2}[A-Za-z]{3})\s+(.+)$')
    
    # Amount patterns in chequing:
    # J$ 70,182.36 +   (credit)
    # J$ 5,674.71 -    (debit)
    # J$ 1,500.00      (balance, no sign)
    amount_pattern = re.compile(r'J\$\s*([\d,]+\.\d{2})\s*([+-]?)')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        m = date_pattern.match(line)
        if m:
            date_str = m.group(1)
            rest = m.group(2).strip()
            
            # Collect continuation lines (indented, no date)
            desc_parts = [rest]
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                # If next line starts with a date pattern, stop
                if date_pattern.match(next_line):
                    break
                # If it's a blank line or a header, stop
                if not next_line.strip():
                    j += 1
                    break
                # If it's indented continuation
                stripped = next_line.strip()
                if stripped and not re.match(r'^\d{2}[A-Za-z]{3}', stripped):
                    desc_parts.append(stripped)
                j += 1
            
            full_text = ' '.join(desc_parts)
            
            # Extract amounts
            amounts = amount_pattern.findall(full_text)
            # Remove amounts from description
            desc = amount_pattern.sub('', full_text).strip()
            desc = re.sub(r'\s+', ' ', desc).strip()
            
            # Skip non-transaction lines
            if any(skip in desc.upper() for skip in [
                "OPENING BALANCE", "CLOSING BALANCE", "DESCRIPTION", "TRANSACTION DATE",
                "CREDIT", "DEBIT", "BALANCE", "SERVICE CHARGE", "INTEREST RATE"
            ]):
                i = j
                continue
            
            if not desc or len(desc) < 2:
                i = j
                continue
            
            tx_date = parse_chequing_date(date_str, year, month)
            if not tx_date:
                i = j
                continue
            
            # Parse amounts: credit (+), debit (-), balance (no sign or last)
            credit_amt = None
            debit_amt = None
            balance_amt = None
            
            for amt_str, sign in amounts:
                val = parse_amount(amt_str)
                if val is None:
                    continue
                if sign == '+':
                    credit_amt = val
                elif sign == '-':
                    debit_amt = val
                else:
                    balance_amt = val
            
            # If we have amounts without signs, try to figure out from context
            if not credit_amt and not debit_amt and amounts:
                # Last amount is likely balance, others are transactions
                if len(amounts) >= 2:
                    balance_amt = parse_amount(amounts[-1][0])
                    # First amount is debit (most common for chequing)
                    debit_amt = parse_amount(amounts[0][0])
            
            vertical, confidence = classify_vertical(desc)
            
            transactions.append({
                "transactionDate": tx_date,
                "description": desc[:500],
                "debitAmount": debit_amt,
                "creditAmount": credit_amt,
                "balance": balance_amt,
                "vertical": vertical,
                "aiConfidence": confidence,
                "statementYear": year,
                "statementMonth": month,
            })
            
            i = j
        else:
            i += 1
    
    return transactions

def parse_credit_card_statement(text, year, month):
    """
    Parse credit card statement transactions.
    Format:
      10-Jan-2025  10-Jan-2025  1072731946  DESCRIPTION  $2,575.11
    Negative amounts = payments/credits.
    """
    transactions = []
    lines = text.split('\n')
    
    # Pattern: date  date  ref_no  description  amount
    # The columns are space-aligned in the PDF
    # Date format: DD-Mon-YYYY
    date_re = r'\d{1,2}-[A-Za-z]{3}-\d{4}'
    
    # Full transaction line pattern
    tx_pattern = re.compile(
        rf'^\s*({date_re})\s+({date_re})\s+(\d{{7,12}})\s+(.+?)\s+\$(-?[\d,]+\.\d{{2}})\s*$'
    )
    
    # Simpler pattern for lines that don't have ref number
    tx_pattern2 = re.compile(
        rf'^\s*({date_re})\s+({date_re})\s+(.+?)\s+\$(-?[\d,]+\.\d{{2}})\s*$'
    )
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        m = tx_pattern.match(line)
        if m:
            trans_date = parse_credit_card_date(m.group(1), year)
            post_date = parse_credit_card_date(m.group(2), year)
            ref_num = m.group(3)
            description = m.group(4).strip()
            amount = parse_amount(m.group(5))
            
            if not trans_date or not description:
                continue
            
            # Skip header lines
            if any(h in description.upper() for h in [
                "TRANSACTION DATE", "POSTING DATE", "REFERENCE", "DESCRIPTION", "AMOUNT"
            ]):
                continue
            
            # Positive = charge (debit), negative = payment (credit)
            debit = amount if amount and amount > 0 else None
            credit = abs(amount) if amount and amount < 0 else None
            
            vertical, confidence = classify_vertical(description)
            
            transactions.append({
                "transactionDate": trans_date,
                "postingDate": post_date,
                "referenceNumber": ref_num,
                "description": description[:500],
                "debitAmount": debit,
                "creditAmount": credit,
                "balance": None,
                "vertical": vertical,
                "aiConfidence": confidence,
                "statementYear": year,
                "statementMonth": month,
            })
            continue
        
        m = tx_pattern2.match(line)
        if m:
            trans_date = parse_credit_card_date(m.group(1), year)
            post_date = parse_credit_card_date(m.group(2), year)
            description = m.group(3).strip()
            amount = parse_amount(m.group(4))
            
            if not trans_date or not description:
                continue
            
            if any(h in description.upper() for h in [
                "TRANSACTION DATE", "POSTING DATE", "REFERENCE", "DESCRIPTION"
            ]):
                continue
            
            debit = amount if amount and amount > 0 else None
            credit = abs(amount) if amount and amount < 0 else None
            
            vertical, confidence = classify_vertical(description)
            
            transactions.append({
                "transactionDate": trans_date,
                "postingDate": post_date,
                "description": description[:500],
                "debitAmount": debit,
                "creditAmount": credit,
                "balance": None,
                "vertical": vertical,
                "aiConfidence": confidence,
                "statementYear": year,
                "statementMonth": month,
            })
    
    return transactions

def process_all_statements():
    """Process all bank statement PDFs."""
    all_results = []
    
    pdf_files = sorted([
        f for f in UPLOAD_DIR.glob("*.pdf")
        if "statement" in f.name.lower()
    ])
    
    print(f"Found {len(pdf_files)} statement PDFs")
    
    for pdf_path in pdf_files:
        print(f"\nProcessing: {pdf_path.name}")
        
        try:
            text = pdf_to_text(pdf_path)
            if not text.strip():
                print(f"  WARNING: No text extracted")
                continue
            
            account_type, account_id = identify_account(pdf_path.name)
            year, month = extract_statement_period(pdf_path.name)
            
            if not year or not month:
                print(f"  WARNING: Could not determine statement period")
                continue
            
            print(f"  Account: {account_type} (id={account_id}), Period: {year}-{month:02d}")
            
            if account_type == "chequing":
                transactions = parse_chequing_statement(text, year, month)
            else:
                transactions = parse_credit_card_statement(text, year, month)
            
            print(f"  Parsed {len(transactions)} transactions")
            
            for tx in transactions:
                tx["accountId"] = account_id
                tx["householdId"] = HOUSEHOLD_ID
                tx["currency"] = "JMD"
                tx["source"] = "bank_statement"
            
            all_results.append({
                "filename": pdf_path.name,
                "account_type": account_type,
                "account_id": account_id,
                "year": year,
                "month": month,
                "transaction_count": len(transactions),
                "transactions": transactions,
            })
            
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_results, f, indent=2, default=str)
    
    total = sum(r["transaction_count"] for r in all_results)
    print(f"\n=== SUMMARY ===")
    print(f"Processed {len(all_results)} statements, {total} total transactions")
    for r in all_results:
        print(f"  {r['filename']}: {r['account_type']} {r['year']}-{r['month']:02d} -> {r['transaction_count']} txns")
    
    return all_results

if __name__ == "__main__":
    process_all_statements()
