#!/usr/bin/env python3
"""Analyze both Airbnb CSV exports to understand coverage, listings, and 2024 income."""
import pandas as pd

# Load both files
df1 = pd.read_csv('airbnb_.csv', encoding='utf-8-sig')
df2 = pd.read_csv('airbnb_01_2024-07_2026.csv', encoding='utf-8-sig')

print("=" * 80)
print("FILE 1: airbnb_.csv")
print("=" * 80)
print(f"Rows: {len(df1)}, Columns: {list(df1.columns)}")
print(f"\nListings in this account:")
listings1 = df1[df1['Listing'].notna()]['Listing'].unique()
for l in listings1:
    print(f"  - {l}")
print(f"\nTypes: {df1['Type'].value_counts().to_dict()}")
print(f"Date range: {df1['Date'].min()} to {df1['Date'].max()}")

# Filter to reservations only for analysis
res1 = df1[df1['Type'] == 'Reservation'].copy()
res1['start_dt'] = pd.to_datetime(res1['Start date'], format='%m/%d/%Y')
res1['year'] = res1['start_dt'].dt.year

print(f"\nReservations by year and listing:")
for year in sorted(res1['year'].unique()):
    yr_df = res1[res1['year'] == year]
    print(f"\n  {int(year)}:")
    for listing in yr_df['Listing'].unique():
        l_df = yr_df[yr_df['Listing'] == listing]
        print(f"    {listing}: {len(l_df)} bookings, Amount: ${l_df['Amount'].sum():,.2f}, Gross: ${l_df['Gross earnings'].sum():,.2f}")

print("\n" + "=" * 80)
print("FILE 2: airbnb_01_2024-07_2026.csv")
print("=" * 80)
print(f"Rows: {len(df2)}, Columns: {list(df2.columns)}")
print(f"\nListings in this account:")
listings2 = df2[df2['Listing'].notna()]['Listing'].unique()
for l in listings2:
    print(f"  - {l}")
print(f"\nTypes: {df2['Type'].value_counts().to_dict()}")
print(f"Date range: {df2['Date'].min()} to {df2['Date'].max()}")

res2 = df2[df2['Type'] == 'Reservation'].copy()
res2['start_dt'] = pd.to_datetime(res2['Start date'], format='%m/%d/%Y')
res2['year'] = res2['start_dt'].dt.year

print(f"\nReservations by year and listing:")
for year in sorted(res2['year'].unique()):
    yr_df = res2[res2['year'] == year]
    print(f"\n  {int(year)}:")
    for listing in yr_df['Listing'].unique():
        l_df = yr_df[yr_df['Listing'] == listing]
        print(f"    {listing}: {len(l_df)} bookings, Amount: ${l_df['Amount'].sum():,.2f}, Gross: ${l_df['Gross earnings'].sum():,.2f}")

# Combined 2024 analysis
print("\n" + "=" * 80)
print("COMBINED 2024 AIRBNB INCOME (Reservations Only)")
print("=" * 80)

res1_2024 = res1[res1['year'] == 2024]
res2_2024 = res2[res2['year'] == 2024]

print(f"\nAccount 1 (airbnb_.csv) - 2024:")
for listing in res1_2024['Listing'].unique():
    l_df = res1_2024[res1_2024['Listing'] == listing]
    print(f"  {listing}")
    print(f"    Bookings: {len(l_df)}")
    print(f"    Amount (host payout): ${l_df['Amount'].sum():,.2f}")
    print(f"    Gross earnings: ${l_df['Gross earnings'].sum():,.2f}")

print(f"\nAccount 2 (airbnb_01_2024-07_2026.csv) - 2024:")
for listing in res2_2024['Listing'].unique():
    l_df = res2_2024[res2_2024['Listing'] == listing]
    print(f"  {listing}")
    print(f"    Bookings: {len(l_df)}")
    print(f"    Amount (host payout): ${l_df['Amount'].sum():,.2f}")
    print(f"    Gross earnings: ${l_df['Gross earnings'].sum():,.2f}")

# Total payouts (what actually hit the bank)
print("\n" + "=" * 80)
print("2024 PAYOUT TOTALS (what hit the bank)")
print("=" * 80)
payouts1_2024 = df1[(df1['Type'] == 'Payout') & (pd.to_datetime(df1['Date'], format='%m/%d/%Y').dt.year == 2024)]
payouts2_2024 = df2[(df2['Type'] == 'Payout') & (pd.to_datetime(df2['Date'], format='%m/%d/%Y').dt.year == 2024)]

print(f"Account 1 payouts 2024: {len(payouts1_2024)} transfers, Total: ${payouts1_2024['Paid out'].sum():,.2f}")
print(f"Account 2 payouts 2024: {len(payouts2_2024)} transfers, Total: ${payouts2_2024['Paid out'].sum():,.2f}")
print(f"Combined 2024 payouts: ${payouts1_2024['Paid out'].sum() + payouts2_2024['Paid out'].sum():,.2f}")
print(f"\nQBO Airbnb deposits 2024: $42,402")
print(f"Difference: ${42402 - (payouts1_2024['Paid out'].sum() + payouts2_2024['Paid out'].sum()):,.2f}")

# Detail the 2024 reservations
print("\n" + "=" * 80)
print("ALL 2024 RESERVATIONS (both accounts)")
print("=" * 80)

all_2024 = pd.concat([res1_2024, res2_2024])
all_2024 = all_2024.sort_values('start_dt')

for _, r in all_2024.iterrows():
    print(f"  {r['Start date']}-{r['End date']} | {r['Guest']:<20} | {r['Listing'][:40]:<40} | ${r['Amount']:>8,.2f} | Conf: {r['Confirmation code']}")

print(f"\n  TOTAL 2024 Reservations: {len(all_2024)}")
print(f"  TOTAL Amount (host payout per booking): ${all_2024['Amount'].sum():,.2f}")
print(f"  TOTAL Gross earnings: ${all_2024['Gross earnings'].sum():,.2f}")
