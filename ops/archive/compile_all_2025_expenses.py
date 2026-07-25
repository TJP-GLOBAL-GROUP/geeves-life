"""
Compile ALL 2025 Artiste's Boutique expenses from:
1. WhatsApp Courtney Robinson transfer receipts (authoritative for cleaning/repair)
2. Gmail JPS/NWC bills (utilities)
3. Bank statement supplementary transactions (insurance, other utilities)

Then map to the Dashboard category columns and write to Google Sheets.
"""
import json
import re
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# ── Load data sources ─────────────────────────────────────────────────────

# 1. Courtney Robinson transfers (from WhatsApp images)
with open('/home/ubuntu/read_courtney_transfers_2025.json') as f:
    courtney_raw = json.load(f)

courtney_transfers = []
for r in courtney_raw['results']:
    o = r['output']
    if not o.get('date') or not o.get('amount_jmd'):
        continue
    
    memo = (o.get('memo') or '').lower()
    amount = float(o.get('amount_jmd', 0))
    date = o.get('date', '')
    
    # Categorize based on memo
    if any(k in memo for k in ['repair', 'plumb', 'glass', 'fix', 'electric', 'bill']):
        if any(k in memo for k in ['clean', 'sweep', 'wash']):
            # Mixed - split 50/50 or use primary
            category = 'CLEANING FEE'  # cleaning is primary
        else:
            category = 'REPAIR COST'
    elif any(k in memo for k in ['shopping', 'supplies', 'pricesmart']):
        category = 'MAINTENANCE SUPPLIES'
    elif any(k in memo for k in ['clean', 'sweep', 'wash', 'mop', 'garbage']):
        category = 'CLEANING FEE'
    elif 'maintenance' in memo or 'extra' in memo or 'bonus' in memo:
        category = 'MAINTENANCE SUPPLIES'
    else:
        # Default for Courtney Robinson = cleaning
        category = 'CLEANING FEE'
    
    try:
        month = int(date.split('-')[1])
    except:
        month = 0
    
    courtney_transfers.append({
        'date': date,
        'month': month,
        'year': 2025,
        'category': category,
        'description': f'Courtney Robinson - {o.get("memo", "cleaning/maintenance")}',
        'amount_jmd': amount,
        'amount_usd': 0,
        'source': 'whatsapp_transfer',
        'reference': o.get('reference', ''),
        'filename': o.get('filename', ''),
    })

print(f'Courtney Robinson transfers: {len(courtney_transfers)}')
total_courtney = sum(t['amount_jmd'] for t in courtney_transfers)
print(f'Total: JMD ${total_courtney:,.0f}')

# 2. Gmail JPS/NWC utility bills
with open('/home/ubuntu/upload/expenses_2025_compiled.json') as f:
    gmail_expenses = json.load(f)

utility_expenses = []
for e in gmail_expenses:
    if e.get('source', '').startswith('gmail_'):
        amount = float(e.get('amount', 0) or 0)
        date = e.get('date', '')
        try:
            month = int(date.split('-')[1])
        except:
            month = e.get('month', 0)
        
        utility_expenses.append({
            'date': date,
            'month': month,
            'year': 2025,
            'category': 'UTILITIES',
            'description': e.get('expense', e.get('description', 'Utility Bill')),
            'amount_jmd': amount,
            'amount_usd': 0,
            'source': e.get('source', 'gmail'),
            'reference': '',
            'filename': Path(e.get('source_file', '')).name if e.get('source_file') else '',
        })

print(f'\nGmail utility bills: {len(utility_expenses)}')
total_utils = sum(e['amount_jmd'] for e in utility_expenses)
print(f'Total: JMD ${total_utils:,.0f}')

# 3. Bank statement supplementary (non-Courtney, non-utility items)
with open('/home/ubuntu/upload/bank_transactions_2025.json') as f:
    bank_txns = json.load(f)

# Filter to only include transactions NOT already covered by Courtney/Gmail
# and with reasonable amounts (not $0, not suspiciously large)
bank_expenses = []
for t in bank_txns:
    desc = t.get('description', '').lower()
    amount = float(t.get('amount_jmd', 0))
    
    # Skip zero amounts
    if amount == 0:
        continue
    
    # Skip Courtney Robinson (covered by WhatsApp receipts)
    if 'courtney' in desc or 'robinson' in desc:
        continue
    
    # Skip suspiciously large amounts (likely totals/balances, not transactions)
    if amount > 500000:
        continue
    
    # Skip insurance credit card fees (not property-specific)
    if 'insurance premiums' in desc and 'credit card' in desc:
        continue
    
    # Only include legitimate property expenses
    category = t.get('category', 'MAINTENANCE')
    
    # Reclassify utilities more carefully
    if 'jps' in desc or 'nwc' in desc or 'bill express' in desc or 'billexpress' in desc:
        category = 'UTILITIES'
    elif 'insurance' in desc:
        category = 'ADMINISTRATIVE EXPENSE'
    elif 'hardware' in desc or 'lumber' in desc or 'pricesmart' in desc:
        category = 'MAINTENANCE SUPPLIES'
    elif 'home and garden' in desc:
        category = 'MAINTENANCE SUPPLIES'
    elif 'ncb waterloo' in desc or 'wongs texaco' in desc:
        # These look like fuel/transport
        category = 'TRANSPORTATION EXPENSE'
    
    bank_expenses.append({
        'date': t['date'],
        'month': t['month'],
        'year': 2025,
        'category': category,
        'description': t['description'][:80],
        'amount_jmd': amount,
        'amount_usd': 0,
        'source': 'bank_statement',
        'reference': '',
        'filename': t.get('source_file', ''),
    })

print(f'\nBank statement supplementary: {len(bank_expenses)}')
total_bank = sum(e['amount_jmd'] for e in bank_expenses)
print(f'Total: JMD ${total_bank:,.0f}')

# ── Merge all sources ─────────────────────────────────────────────────────
all_expenses = courtney_transfers + utility_expenses + bank_expenses
all_expenses.sort(key=lambda x: (x['month'], x['date']))

print(f'\nTotal combined expenses: {len(all_expenses)}')
grand_total = sum(e['amount_jmd'] for e in all_expenses)
print(f'Grand total: JMD ${grand_total:,.0f}')

# ── Monthly breakdown by category ─────────────────────────────────────────
# Dashboard categories (columns F-X):
DASHBOARD_CATEGORIES = [
    'ADMINISTRATIVE EXPENSE',
    'ASSETS: EQUIPMENT',
    'ASSETS: FURNITURE',
    'BANK FEES',
    'CLEANING FEE',
    'CLEANING SUPPLIES',
    'MAINTENANCE SUPPLIES',
    'MORTGAGE PAYMENT',
    'FIXTURES AND FITTINGS',
    'PROPERTY TAX',
    'PERSONAL EXPENSE',
    'REPAIR COST',
    'TRANSPORTATION EXPENSE',
    'UTILITIES',
    'VEHICLE EXPENSE',
    'VEHICLE LOAN',
    'VEHICLE REPAIR COST',
]

# Build monthly totals per category
monthly_totals = defaultdict(lambda: defaultdict(float))
for e in all_expenses:
    m = e['month']
    cat = e['category']
    monthly_totals[m][cat] += e['amount_jmd']

print('\n=== Monthly Summary by Category ===')
for m in range(1, 13):
    if monthly_totals[m]:
        month_total = sum(monthly_totals[m].values())
        print(f'\nMonth {m:02d}:  Total JMD ${month_total:,.0f}')
        for cat, amt in sorted(monthly_totals[m].items()):
            if amt > 0:
                print(f'  {cat}: JMD ${amt:,.0f}')

# Save compiled data
with open('/home/ubuntu/upload/all_2025_expenses_final.json', 'w') as f:
    json.dump({
        'expenses': all_expenses,
        'monthly_totals': {str(m): dict(v) for m, v in monthly_totals.items()},
        'dashboard_categories': DASHBOARD_CATEGORIES,
    }, f, indent=2)

print('\nSaved to all_2025_expenses_final.json')

# ── Build the Dashboard rows ───────────────────────────────────────────────
MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

dashboard_rows = []
year_totals = defaultdict(float)

for m in range(1, 13):
    row = ['', '', f'{MONTHS[m-1]}-2025', m, 2025]
    row_total = 0
    for cat in DASHBOARD_CATEGORIES:
        amt = monthly_totals[m].get(cat, 0)
        row.append(f'${amt:,.2f}' if amt > 0 else '$0.00')
        row_total += amt
        year_totals[cat] += amt
    row.append('')  # blank col W
    row.append(f'${row_total:,.2f}')  # TOTAL col X
    row.append('')  # blank col Y
    row.append('$0.00')  # TAZ LOAN col Z
    dashboard_rows.append(row)

# Year total row
total_row = ['', '', 'Year Total', '', '']
grand = 0
for cat in DASHBOARD_CATEGORIES:
    amt = year_totals[cat]
    total_row.append(f'${amt:,.2f}' if amt > 0 else '$0.00')
    grand += amt
total_row.append('')
total_row.append(f'${grand:,.2f}')
total_row.append('')
total_row.append('$0.00')
dashboard_rows.append(total_row)

with open('/home/ubuntu/upload/dashboard_2025_rows.json', 'w') as f:
    json.dump(dashboard_rows, f, indent=2)

print(f'\nDashboard rows saved: {len(dashboard_rows)} rows')
print(f'Grand total for 2025: JMD ${grand:,.0f}')
