"""
LLM-based categorization of order items for property expense attribution.
Processes items in batches for efficiency.
"""
import mysql.connector
import json
import requests
import subprocess
import sys
from urllib.parse import urlparse

# Config
DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'

# Get env vars
result = subprocess.run(['bash', '-c', 'cat /proc/$(pgrep -f tsx | head -1)/environ 2>/dev/null | tr "\\0" "\\n"'], 
                      capture_output=True, text=True)
FORGE_API_URL = None
FORGE_API_KEY = None
for line in result.stdout.strip().split('\n'):
    if '=' in line:
        k, v = line.split('=', 1)
        if k == 'BUILT_IN_FORGE_API_URL': FORGE_API_URL = v
        elif k == 'BUILT_IN_FORGE_API_KEY': FORGE_API_KEY = v

print(f"Forge API: {FORGE_API_URL[:30]}...")

# Connect to DB
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# Get all unclassified items with their order context
cur.execute("""
    SELECT oi.id, oi.name, oi.quantity, oi.unitPrice, oi.lineTotal, oi.deliveryAddress,
           o.vendor, o.orderDate, o.totalAmount as orderTotal
    FROM order_items oi
    JOIN orders o ON o.id = oi.orderId
    WHERE oi.propertyAttribution = 'unclassified'
    ORDER BY o.orderDate DESC
""")
items = cur.fetchall()
print(f"Found {len(items)} unclassified items to categorize")

# Process in batches of 20
BATCH_SIZE = 20
total_categorized = 0
batch_num = 0

for i in range(0, len(items), BATCH_SIZE):
    batch = items[i:i+BATCH_SIZE]
    batch_num += 1
    
    # Build batch prompt
    items_text = ""
    for idx, item in enumerate(batch):
        addr = item.get('deliveryAddress') or 'Unknown'
        items_text += f"""
Item {idx+1}:
  - Name: {item['name']}
  - Vendor: {item['vendor']}
  - Price: ${item['unitPrice'] or 'N/A'} x {item['quantity']}
  - Order Date: {item['orderDate']}
  - Delivery Address: {addr}
"""

    prompt = f"""You are categorizing purchases for a short-term rental property business owner. 
The owner has these properties:
1. "Artiste's Boutique" — Kingston, Jamaica (Caribbean vacation rental)
2. "Sunset Studio" — Burdett, NY (Seneca Lake area vacation rental)  
3. "Morabeza" — Burdett, NY (Seneca Lake area vacation rental, same location as Sunset Studio)

CATEGORIZATION RULES:
- Delivery to "Aeropost", "Miami, FL" (shipping hub for Jamaica), "3024 Braxton Wood", or "Kingston" → Jamaica property ("artistes_boutique")
- Delivery to "Burdett", "Watkins Glen", "Seneca" area → NY property ("sunset_morabeza")
- Items like sheets, towels, pillows, bedding, bathroom supplies, cleaning products, kitchen items, furniture, decor, storage → likely PROPERTY expense
- Items like food, groceries, snacks, personal care, clothing, toys, electronics for personal use → likely PERSONAL
- Home improvement items (paint, hardware, tools, fixtures) → likely PROPERTY expense
- If delivery address clearly indicates a property location, use that
- If item is clearly for a rental (hotel-style supplies, bulk cleaning, etc.) → PROPERTY
- If uncertain, mark as "needs_review"

For each item, return a JSON array with objects containing:
- id: the item number (1-indexed)
- property: "artistes_boutique" | "sunset_morabeza" | "personal" | "needs_review"
- category: "fixtures_fittings" | "cleaning_supplies" | "linens_bedding" | "kitchen" | "furniture" | "decor" | "maintenance" | "electronics" | "groceries_food" | "personal_care" | "clothing" | "other"
- taxDeductible: true | false
- confidence: 0.0-1.0
- reasoning: brief explanation (max 20 words)

{items_text}

Return ONLY the JSON array, no other text."""

    try:
        resp = requests.post(
            f"{FORGE_API_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {FORGE_API_KEY}", "Content-Type": "application/json"},
            json={
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            },
            timeout=60
        )
        
        if resp.status_code != 200:
            print(f"  Batch {batch_num}: API error {resp.status_code}")
            continue
        
        content = resp.json()['choices'][0]['message']['content']
        # Parse response - handle both array and object wrapper
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            # LLM might wrap in {"items": [...]} or {"results": [...]}
            results = parsed.get('items') or parsed.get('results') or parsed.get('classifications') or list(parsed.values())[0]
        else:
            results = parsed
        
        if not isinstance(results, list):
            print(f"  Batch {batch_num}: Unexpected response format")
            continue
        
        # Apply categorizations
        for result in results:
            idx = result.get('id', 0) - 1
            if idx < 0 or idx >= len(batch):
                continue
            
            item = batch[idx]
            property_attr = result.get('property', 'needs_review')
            category = result.get('category', 'other')
            tax_deductible = result.get('taxDeductible', False)
            confidence = result.get('confidence', 0.5)
            
            # Map property values to valid enum
            prop_map = {
                'artistes_boutique': 'artistes_boutique',
                'artiste_boutique': 'artistes_boutique',
                'jamaica': 'artistes_boutique',
                'sunset_morabeza': 'sunset_studio',
                'sunset_studio': 'sunset_studio',
                'morabeza': 'morabeza',
                'ny_property': 'sunset_studio',
                'personal': 'personal',
                'needs_review': 'unclassified',
            }
            mapped_prop = prop_map.get(property_attr, 'unclassified')
            confidence_int = int(confidence * 100) if confidence <= 1 else int(confidence)
            
            cur.execute("""
                UPDATE order_items 
                SET propertyAttribution = %s, expenseCategory = %s, 
                    isTaxDeductible = %s, aiConfidence = %s
                WHERE id = %s
            """, (mapped_prop, category, 1 if tax_deductible else 0, confidence_int, item['id']))
            total_categorized += 1
        
        conn.commit()
        print(f"  Batch {batch_num}/{(len(items) + BATCH_SIZE - 1) // BATCH_SIZE}: Categorized {len(results)} items")
        sys.stdout.flush()
        
    except Exception as e:
        print(f"  Batch {batch_num}: Error - {e}")
        conn.rollback()

# Print summary
print(f"\n{'=' * 60}")
print(f"CATEGORIZATION COMPLETE")
print(f"{'=' * 60}")
print(f"Total categorized: {total_categorized}")

cur.execute("""
    SELECT propertyAttribution, COUNT(*) as cnt, SUM(COALESCE(lineTotal, 0)) as total
    FROM order_items 
    GROUP BY propertyAttribution
    ORDER BY cnt DESC
""")
print("\nBy Property Attribution:")
for row in cur.fetchall():
    print(f"  {row['propertyAttribution']}: {row['cnt']} items (${row['total'] or 0:.2f})")

cur.execute("""
    SELECT expenseCategory, COUNT(*) as cnt, SUM(COALESCE(lineTotal, 0)) as total
    FROM order_items 
    WHERE isTaxDeductible = 1
    GROUP BY expenseCategory
    ORDER BY total DESC
""")
print("\nTax Deductible by Category:")
for row in cur.fetchall():
    print(f"  {row['expenseCategory']}: {row['cnt']} items (${row['total'] or 0:.2f})")

conn.close()
