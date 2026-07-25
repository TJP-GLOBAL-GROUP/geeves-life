import csv
import os
import re

# === Airbnb CSVs ===
for fname in ['airbnb_01_2024-12_2024.csv', 'airbnb_01_2025-12_2025.csv', 'airbnb_01_2026-06_2026.csv']:
    path = f'/home/ubuntu/upload/{fname}'
    if not os.path.exists(path):
        print(f"MISSING: {fname}")
        continue
    print(f"\n=== {fname} ===")
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)
    print(f"Total rows: {len(rows)}")
    if rows:
        print(f"Headers: {rows[0]}")
    for row in rows[1:6]:
        print(row)

# === Bank statement file inventory ===
print("\n=== BANK STATEMENT FILES ===")
files = sorted([f for f in os.listdir('/home/ubuntu/upload') if f.endswith('.pdf')])
chequing = [f for f in files if '(1)' not in f and '(2)' not in f]
mastercard = [f for f in files if '(1)' in f]
third = [f for f in files if '(2)' in f]
print(f"Chequing (620505) - no suffix: {len(chequing)} files")
for f in chequing: print(f"  {f}")
print(f"\nMastercard (6376) - (1) suffix: {len(mastercard)} files")
for f in mastercard: print(f"  {f}")
print(f"\nThird account - (2) suffix: {len(third)} files")
for f in third: print(f"  {f}")
