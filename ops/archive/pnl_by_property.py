import pandas as pd
import numpy as np

# Parse QBO transaction list
qbo = pd.read_csv('/home/ubuntu/tax_prep/qbo_transaction_list.csv', skiprows=4)

# Clean amount column
qbo['Amount'] = qbo['Amount'].astype(str).str.replace(',', '').str.strip()
qbo['Amount'] = pd.to_numeric(qbo['Amount'], errors='coerce')

# Parse dates
qbo['Date'] = pd.to_datetime(qbo['Date'], format='%m/%d/%Y', errors='coerce')

# Filter 2024 only
qbo_2024 = qbo[(qbo['Date'] >= '2024-01-01') & (qbo['Date'] < '2025-01-01')].copy()
print(f"Total 2024 transactions: {len(qbo_2024)}")

# Identify STR-related accounts and expenses
# First, let's see all unique account names
print(f"\n{'='*60}")
print("ALL ACCOUNT NAMES (with STR relevance):")
print("="*60)

# Look for STR-related expense accounts
str_keywords = ['rental', 'str', 'property', 'airbnb', 'vrbo', 'cleaning', 'maintenance',
                'repair', 'utility', 'utilities', 'insurance', 'mortgage', 'interest',
                'supplies', 'furnish', 'depreciation', 'travel', 'commission']

all_accounts = qbo_2024['Account name'].dropna().unique()
print(f"\nAll unique accounts ({len(all_accounts)}):")
for acc in sorted(all_accounts):
    count = len(qbo_2024[qbo_2024['Account name'] == acc])
    total = qbo_2024[qbo_2024['Account name'] == acc]['Amount'].sum()
    print(f"  {acc:<50} | {count:>4} txns | ${total:>12,.2f}")

# Also check the "Split" column for expense categories
print(f"\n\n{'='*60}")
print("SPLIT CATEGORIES (expense detail):")
print("="*60)
all_splits = qbo_2024['Split'].dropna().unique()
for split in sorted(all_splits):
    count = len(qbo_2024[qbo_2024['Split'] == split])
    total = qbo_2024[qbo_2024['Split'] == split]['Amount'].sum()
    if abs(total) > 50:  # Only show meaningful amounts
        print(f"  {split:<50} | {count:>4} txns | ${total:>12,.2f}")

# Check the "Account full name" for hierarchy
print(f"\n\n{'='*60}")
print("ACCOUNT FULL NAMES (hierarchical):")
print("="*60)
full_names = qbo_2024['Account full name'].dropna().unique()
for fn in sorted(full_names):
    count = len(qbo_2024[qbo_2024['Account full name'] == fn])
    total = qbo_2024[qbo_2024['Account full name'] == fn]['Amount'].sum()
    if abs(total) > 100:
        print(f"  {fn:<60} | {count:>4} txns | ${total:>12,.2f}")

# Check Customer column for property-level tracking
print(f"\n\n{'='*60}")
print("CUSTOMERS (property-level tracking):")
print("="*60)
customers = qbo_2024['Customer'].dropna().unique()
for cust in sorted(customers):
    count = len(qbo_2024[qbo_2024['Customer'] == cust])
    total = qbo_2024[qbo_2024['Customer'] == cust]['Amount'].sum()
    print(f"  {cust:<40} | {count:>4} txns | ${total:>12,.2f}")
