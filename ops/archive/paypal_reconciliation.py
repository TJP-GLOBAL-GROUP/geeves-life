import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from copy import copy

# Load all 3 PayPal CSVs
pp_2024 = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/paypal_new/PayPal 2024.CSV', encoding='utf-8-sig')
pp_2025 = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/paypal_new/PayPal 2025.CSV', encoding='utf-8-sig')
pp_2026 = pd.read_csv('/home/ubuntu/tax_prep/gdrive_data/paypal_new/PayPal Jan - June 2026.CSV', encoding='utf-8-sig')

print(f"PayPal 2024: {len(pp_2024)} rows")
print(f"PayPal 2025: {len(pp_2025)} rows")
print(f"PayPal 2026: {len(pp_2026)} rows")

# Combine all
pp_all = pd.concat([pp_2024, pp_2025, pp_2026], ignore_index=True)
print(f"Total: {len(pp_all)} rows")
print(f"\nColumns: {list(pp_all.columns)}")

# Check key columns
print(f"\nTransaction Types: {pp_all['Type'].value_counts().to_dict()}")
print(f"\nStatuses: {pp_all['Status'].value_counts().to_dict()}")

# Parse amounts (remove commas)
def parse_amount(val):
    if pd.isna(val) or val == '':
        return 0.0
    return float(str(val).replace(',', ''))

pp_all['Gross_num'] = pp_all['Gross'].apply(parse_amount)
pp_all['Fee_num'] = pp_all['Fee'].apply(parse_amount)
pp_all['Net_num'] = pp_all['Net'].apply(parse_amount)

# Filter to transactions that impact balance (actual money movement)
balance_impact = pp_all[pp_all['Balance Impact'] == 'Credit']
print(f"\nCredit transactions: {len(balance_impact)}")
print(f"Credit total: ${balance_impact['Gross_num'].sum():,.2f}")

debit_impact = pp_all[pp_all['Balance Impact'] == 'Debit']
print(f"\nDebit transactions: {len(debit_impact)}")
print(f"Debit total: ${debit_impact['Gross_num'].sum():,.2f}")

# Focus on 2024 for reconciliation
# Parse dates
pp_all['Date_parsed'] = pd.to_datetime(pp_all['Date'], format='%m/%d/%Y', errors='coerce')
pp_2024_data = pp_all[pp_all['Date_parsed'].dt.year == 2024].copy()
print(f"\n\n{'='*80}")
print(f"2024 PAYPAL ANALYSIS")
print(f"{'='*80}")
print(f"Total 2024 rows: {len(pp_2024_data)}")

# Credits (money in)
credits_2024 = pp_2024_data[pp_2024_data['Balance Impact'] == 'Credit']
print(f"\n2024 Credits (money received): {len(credits_2024)}")
print(f"  Total: ${credits_2024['Gross_num'].sum():,.2f}")
print(f"\n  By Type:")
for t, grp in credits_2024.groupby('Type'):
    print(f"    {t}: {len(grp)} txns, ${grp['Gross_num'].sum():,.2f}")

# Debits (money out)
debits_2024 = pp_2024_data[pp_2024_data['Balance Impact'] == 'Debit']
print(f"\n2024 Debits (money out): {len(debits_2024)}")
print(f"  Total: ${debits_2024['Gross_num'].sum():,.2f}")
print(f"\n  By Type:")
for t, grp in debits_2024.groupby('Type'):
    print(f"    {t}: {len(grp)} txns, ${grp['Gross_num'].sum():,.2f}")

# Show all credit transactions with details for classification
print(f"\n\n2024 CREDIT TRANSACTIONS (for classification):")
print(f"{'Date':<12} | {'Name':<30} | {'Type':<20} | {'Gross':>10} | {'From Email':<40} | {'Item'}")
print("-"*150)
for _, row in credits_2024.sort_values('Date_parsed').iterrows():
    date = row['Date_parsed'].strftime('%m/%d/%Y') if pd.notna(row['Date_parsed']) else ''
    name = str(row['Name'])[:30] if pd.notna(row['Name']) else ''
    typ = str(row['Type'])[:20] if pd.notna(row['Type']) else ''
    gross = row['Gross_num']
    from_email = str(row['From Email Address'])[:40] if pd.notna(row['From Email Address']) else ''
    item = str(row['Item Title'])[:50] if pd.notna(row['Item Title']) else ''
    print(f"{date:<12} | {name:<30} | {typ:<20} | ${gross:>8,.2f} | {from_email:<40} | {item}")

# Identify STR-related payments (booking.com invoices)
print(f"\n\n{'='*80}")
print("BOOKING.COM RELATED TRANSACTIONS (from email addresses):")
booking_txns = pp_2024_data[pp_2024_data['From Email Address'].str.contains('booking.com', na=False)]
print(f"Found {len(booking_txns)} booking.com transactions")
for _, row in booking_txns.iterrows():
    date = row['Date_parsed'].strftime('%m/%d/%Y') if pd.notna(row['Date_parsed']) else ''
    print(f"  {date} | {row['Type']} | ${row['Gross_num']:,.2f} | {row['Status']} | {row['From Email Address']} | {row['Item Title']}")
EOF
