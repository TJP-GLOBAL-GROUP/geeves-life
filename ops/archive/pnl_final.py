import pandas as pd
import numpy as np

# Parse QBO
qbo = pd.read_csv('/home/ubuntu/tax_prep/qbo_transaction_list.csv', skiprows=4)
qbo['Amount'] = qbo['Amount'].astype(str).str.replace(',', '').str.strip()
qbo['Amount'] = pd.to_numeric(qbo['Amount'], errors='coerce')
qbo['Date'] = pd.to_datetime(qbo['Date'], format='%m/%d/%Y', errors='coerce')
qbo_2024 = qbo[(qbo['Date'] >= '2024-01-01') & (qbo['Date'] < '2025-01-01')].copy()

print("="*80)
print("2024 SHORT TERM RENTAL P&L BY PROPERTY")
print("="*80)

# ============================================================
# INCOME (from verified Geeves data - accrual basis, which is the correct tax basis)
# ============================================================
income_data = {
    'Penthouse': {
        'Airbnb': 12457.65,
        'VRBO': 9759.53,
        'Booking.com': 0,
        'PayPal': 0,
    },
    'Sunset Studio': {
        'Airbnb': 5472.30,
        'VRBO': 5100.12,
        'Booking.com': 0,
        'PayPal': 0,
    },
    "Artiste's Boutique": {
        'Airbnb': 34442.73,
        'VRBO': 667.00,
        'Booking.com': 2105.38,
        'PayPal': 1637.91,
    }
}

print("\n" + "="*80)
print("INCOME BY PROPERTY AND PLATFORM (Accrual Basis - Verified from Exports)")
print("="*80)
total_income = 0
for prop, platforms in income_data.items():
    prop_total = sum(platforms.values())
    total_income += prop_total
    print(f"\n  {prop}:")
    for platform, amount in platforms.items():
        if amount > 0:
            print(f"    {platform:<20} ${amount:>10,.2f}")
    print(f"    {'SUBTOTAL':<20} ${prop_total:>10,.2f}")

print(f"\n  {'TOTAL STR INCOME':<25} ${total_income:>10,.2f}")

# ============================================================
# EXPENSES (from QBO - need to allocate by property)
# ============================================================
print("\n\n" + "="*80)
print("EXPENSES BY CATEGORY (from QBO)")
print("="*80)

# Extract expense transactions by Split category
expense_cats = {}

# Cleaning
cleaning = qbo_2024[qbo_2024['Split'].str.contains('Cleaning', na=False)]
expense_cats['Cleaning'] = cleaning['Amount'].sum()

# Repairs & Maintenance (parent only, not sub-categories)
repairs = qbo_2024[qbo_2024['Split'] == 'Repairs & Maintenance']
expense_cats['Repairs & Maintenance'] = repairs['Amount'].sum()

# Repairs - Labor
labor = qbo_2024[qbo_2024['Split'].str.contains('Repairs & Maintenance - Labor', na=False)]
expense_cats['Repairs - Labor'] = labor['Amount'].sum()

# Utilities
utilities = qbo_2024[qbo_2024['Split'].str.contains('Utilities', na=False)]
expense_cats['Utilities'] = utilities['Amount'].sum()

# Insurance
insurance = qbo_2024[qbo_2024['Split'].str.contains('Insurance', na=False)]
expense_cats['Insurance'] = insurance['Amount'].sum()

# Mortgage
mortgage = qbo_2024[qbo_2024['Split'].str.contains('Mortgage', na=False)]
expense_cats['Mortgage Interest'] = mortgage['Amount'].sum()

# Taxes & Licenses
taxes = qbo_2024[qbo_2024['Split'].str.contains('Taxes & Licenses', na=False)]
expense_cats['Taxes & Licenses'] = taxes['Amount'].sum()

# Advertising
advertising = qbo_2024[qbo_2024['Split'].str.contains('Advertising', na=False)]
expense_cats['Advertising'] = advertising['Amount'].sum()

# Rental Property Asset (supplies/furnishings)
rental_asset = qbo_2024[qbo_2024['Split'].str.contains('Rental Property Asset', na=False)]
expense_cats['Supplies & Furnishings'] = rental_asset['Amount'].sum()

# Administrative
admin = qbo_2024[qbo_2024['Split'].str.contains('Administrative', na=False)]
expense_cats['Administrative'] = admin['Amount'].sum()

# Legal & Professional
legal = qbo_2024[qbo_2024['Split'].str.contains('Legal', na=False)]
expense_cats['Legal & Professional'] = legal['Amount'].sum()

total_expenses = 0
for cat, amount in expense_cats.items():
    if amount != 0:
        print(f"  {cat:<35} ${amount:>10,.2f}")
        total_expenses += amount

print(f"  {'-'*55}")
print(f"  {'TOTAL STR EXPENSES':<35} ${total_expenses:>10,.2f}")

# ============================================================
# PROPERTY ALLOCATION
# ============================================================
# QBO doesn't track expenses by property. We need to allocate.
# Key observations from the data:
# - NYSEG (electric) has 2 separate bills → likely 2 NY units
# - Capital One payments → Jamaica utilities (JPS = Jamaica Public Service)
# - Racquel Steer (cleaning) → NY properties
# - JPS-ECOMMERCE → Jamaica electricity
# - BOSSREVOLUTIONMON → Jamaica phone/internet
# - Progressive insurance → NY
# - State Farm insurance → likely Jamaica or auto
# - Wayne Cooperative insurance → NY
# - Aqua Finance → NY (water heater financing)
# - Mortgage (Jim Curatolo) → NY property

print("\n\n" + "="*80)
print("EXPENSE ALLOCATION BY PROPERTY")
print("="*80)
print("\nBased on vendor analysis from QBO memos:")

# Analyze utilities by vendor to allocate
util_txns = qbo_2024[qbo_2024['Split'].str.contains('Utilities', na=False)].copy()
print(f"\n  UTILITIES BREAKDOWN:")

# NYSEG = NY electric (2 meters - Penthouse + Studio)
nyseg = util_txns[util_txns['Name'].str.contains('NYSEG', na=False)]
nyseg_total = nyseg['Amount'].sum()
print(f"    NYSEG (NY Electric - 2 meters)     ${nyseg_total:>8,.2f}")

# Capital One payments to JPS = Jamaica electric
# These show as "CAPITAL ONE DES:MOBILE PMT" in Memo
capone_util = util_txns[util_txns['Memo'].str.contains('CAPITAL ONE', na=False)]
capone_total = capone_util['Amount'].sum()
print(f"    Capital One → JPS (Jamaica Elec)   ${capone_total:>8,.2f}")

# JPS direct
jps = util_txns[util_txns['Memo'].str.contains('JPS', na=False)]
jps_total = jps['Amount'].sum()
print(f"    JPS Direct (Jamaica Electric)      ${jps_total:>8,.2f}")

# BOSS Revolution = Jamaica phone/internet
boss = util_txns[util_txns['Memo'].str.contains('BOSS', na=False)]
boss_total = boss['Amount'].sum()
print(f"    Boss Revolution (Jamaica Telecom)  ${boss_total:>8,.2f}")

# Other utilities
other_util = util_txns[~util_txns.index.isin(nyseg.index) & 
                       ~util_txns.index.isin(capone_util.index) &
                       ~util_txns.index.isin(jps.index) &
                       ~util_txns.index.isin(boss.index)]
other_total = other_util['Amount'].sum()
print(f"    Other Utilities                    ${other_total:>8,.2f}")

# Insurance breakdown
ins_txns = qbo_2024[qbo_2024['Split'].str.contains('Insurance', na=False)].copy()
print(f"\n  INSURANCE BREAKDOWN:")
progressive = ins_txns[ins_txns['Name'].str.contains('Progressive', na=False)]
print(f"    Progressive (NY Property)          ${progressive['Amount'].sum():>8,.2f}")
wayne = ins_txns[ins_txns['Name'].str.contains('Wayne', na=False)]
print(f"    Wayne Cooperative (NY)             ${wayne['Amount'].sum():>8,.2f}")
state_farm = ins_txns[ins_txns['Name'].str.contains('State Farm', na=False)]
print(f"    State Farm                         ${state_farm['Amount'].sum():>8,.2f}")

# Cleaning breakdown
clean_txns = qbo_2024[qbo_2024['Split'].str.contains('Cleaning', na=False)].copy()
print(f"\n  CLEANING BREAKDOWN:")
racquel = clean_txns[clean_txns['Name'].str.contains('Racquel', na=False)]
print(f"    Racquel Steer (NY)                 ${racquel['Amount'].sum():>8,.2f}")
other_clean = clean_txns[~clean_txns.index.isin(racquel.index)]
if len(other_clean) > 0:
    for _, row in other_clean.iterrows():
        name = str(row['Name'])[:25] if pd.notna(row['Name']) else 'Unknown'
        print(f"    {name:<35} ${row['Amount']:>8,.2f}")

# ============================================================
# FINAL P&L BY PROPERTY
# ============================================================
print("\n\n" + "="*80)
print("ESTIMATED P&L BY PROPERTY (2024)")
print("="*80)

# NY property expenses (shared between Penthouse and Studio)
ny_nyseg = nyseg_total
ny_insurance = progressive['Amount'].sum() + wayne['Amount'].sum()
ny_cleaning = racquel['Amount'].sum()
ny_mortgage = expense_cats['Mortgage Interest']
ny_repairs = expense_cats['Repairs & Maintenance'] + expense_cats['Repairs - Labor']
ny_taxes = expense_cats['Taxes & Licenses']
ny_admin = expense_cats['Administrative']
ny_legal = expense_cats['Legal & Professional']
ny_supplies = expense_cats['Supplies & Furnishings']

# Jamaica expenses
ja_utilities = capone_total + jps_total + boss_total
ja_insurance = state_farm['Amount'].sum()
ja_cleaning_other = expense_cats['Cleaning'] - racquel['Amount'].sum()

# Allocate NY shared expenses 50/50 between Penthouse and Studio
ph_ratio = 0.50
st_ratio = 0.50

print(f"\n  Allocation ratios (50/50 split):")
print(f"    Penthouse: {ph_ratio:.0%} of NY shared expenses")
print(f"    Studio:    {st_ratio:.0%} of NY shared expenses")

# Calculate property incomes for display
ny_ph_income = income_data['Penthouse']['Airbnb'] + income_data['Penthouse']['VRBO']
ny_st_income = income_data['Sunset Studio']['Airbnb'] + income_data['Sunset Studio']['VRBO']

# Total NY shared expenses
ny_shared = ny_nyseg + ny_insurance + ny_mortgage + ny_repairs + ny_taxes + ny_admin + ny_legal + ny_supplies

# Cleaning: try to split by looking at NYSEG pattern (2 separate bills)
# NYSEG has pairs of bills - let's assume roughly equal
nyseg_amounts = nyseg['Amount'].tolist()
# Sort to try to pair them
nyseg_amounts.sort()
# The higher bills are likely Penthouse (larger unit)

print(f"\n{'='*80}")
print(f"{'PROPERTY':<25} | {'INCOME':>10} | {'EXPENSES':>10} | {'NET P&L':>10}")
print(f"{'='*80}")

# PENTHOUSE
ph_income = ny_ph_income
ph_cleaning = ny_cleaning * ph_ratio
ph_shared = ny_shared * ph_ratio
ph_expenses = ph_cleaning + ph_shared
print(f"{'Penthouse':<25} | ${ph_income:>9,.2f} | ${ph_expenses:>9,.2f} | ${ph_income + ph_expenses:>9,.2f}")

# SUNSET STUDIO
st_income = ny_st_income
st_cleaning = ny_cleaning * st_ratio
st_shared = ny_shared * st_ratio
st_expenses = st_cleaning + st_shared
print(f"{'Sunset Studio':<25} | ${st_income:>9,.2f} | ${st_expenses:>9,.2f} | ${st_income + st_expenses:>9,.2f}")

# ARTISTE'S BOUTIQUE
ja_income = sum(income_data["Artiste's Boutique"].values())
ja_expenses = ja_utilities + ja_insurance + ja_cleaning_other + expense_cats['Advertising']
print(f"{"Artiste's Boutique":<25} | ${ja_income:>9,.2f} | ${ja_expenses:>9,.2f} | ${ja_income + ja_expenses:>9,.2f}")

print(f"{'-'*80}")
total_exp = ph_expenses + st_expenses + ja_expenses
print(f"{'TOTAL':<25} | ${total_income:>9,.2f} | ${total_exp:>9,.2f} | ${total_income + total_exp:>9,.2f}")

# Detailed expense breakdown per property
print(f"\n\n{'='*80}")
print("DETAILED EXPENSE BREAKDOWN BY PROPERTY")
print("="*80)

print(f"\n  {'CATEGORY':<30} | {'Penthouse':>10} | {'Studio':>10} | {'Artistes':>10} | {'TOTAL':>10}")
print(f"  {'-'*80}")

categories_detail = [
    ('Utilities (Electric)', ny_nyseg * ph_ratio, ny_nyseg * st_ratio, ja_utilities + other_total, ny_nyseg + ja_utilities + other_total),
    ('Insurance', ny_insurance * ph_ratio, ny_insurance * st_ratio, ja_insurance, ny_insurance + ja_insurance),
    ('Cleaning', ph_cleaning, st_cleaning, ja_cleaning_other, ny_cleaning + ja_cleaning_other),
    ('Repairs & Maintenance', ny_repairs * ph_ratio, ny_repairs * st_ratio, 0, ny_repairs),
    ('Mortgage Interest', ny_mortgage * ph_ratio, ny_mortgage * st_ratio, 0, ny_mortgage),
    ('Taxes & Licenses', ny_taxes * ph_ratio, ny_taxes * st_ratio, 0, ny_taxes),
    ('Supplies & Furnishings', ny_supplies * ph_ratio, ny_supplies * st_ratio, 0, ny_supplies),
    ('Administrative', ny_admin * ph_ratio, ny_admin * st_ratio, 0, ny_admin),
    ('Legal & Professional', ny_legal * ph_ratio, ny_legal * st_ratio, 0, ny_legal),
    ('Advertising', 0, 0, expense_cats['Advertising'], expense_cats['Advertising']),
]

for cat, ph, st, ja, tot in categories_detail:
    if abs(tot) > 10:
        print(f"  {cat:<30} | ${ph:>9,.2f} | ${st:>9,.2f} | ${ja:>9,.2f} | ${tot:>9,.2f}")

print(f"  {'-'*80}")
ph_total_exp = sum(row[1] for row in categories_detail)
st_total_exp = sum(row[2] for row in categories_detail)
ja_total_exp = sum(row[3] for row in categories_detail)
all_total_exp = sum(row[4] for row in categories_detail)
print(f"  {'TOTAL EXPENSES':<30} | ${ph_total_exp:>9,.2f} | ${st_total_exp:>9,.2f} | ${ja_total_exp:>9,.2f} | ${all_total_exp:>9,.2f}")
print(f"  {'INCOME':<30} | ${ph_income:>9,.2f} | ${st_income:>9,.2f} | ${ja_income:>9,.2f} | ${total_income:>9,.2f}")
print(f"  {'NET P&L':<30} | ${ph_income+ph_total_exp:>9,.2f} | ${st_income+st_total_exp:>9,.2f} | ${ja_income+ja_total_exp:>9,.2f} | ${total_income+all_total_exp:>9,.2f}")
