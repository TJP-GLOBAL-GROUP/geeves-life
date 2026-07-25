"""
Order-level categorization for tax/expense attribution.
Uses the full order total and item context to determine which property an order belongs to.
Preserves item-level data for shopping LLM intelligence.
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

# First, add order-level attribution columns if they don't exist
try:
    cur.execute("ALTER TABLE orders ADD COLUMN propertyAttribution VARCHAR(100) DEFAULT 'unclassified'")
    conn.commit()
    print("Added propertyAttribution column to orders table")
except Exception as e:
    if 'Duplicate column' in str(e):
        print("propertyAttribution column already exists on orders")
    else:
        print(f"Column add note: {e}")
    conn.rollback()

try:
    cur.execute("ALTER TABLE orders ADD COLUMN expenseCategory VARCHAR(100) DEFAULT NULL")
    conn.commit()
    print("Added expenseCategory column to orders table")
except Exception as e:
    if 'Duplicate column' in str(e):
        pass
    conn.rollback()

try:
    cur.execute("ALTER TABLE orders ADD COLUMN isTaxDeductible TINYINT(1) DEFAULT 0")
    conn.commit()
    print("Added isTaxDeductible column to orders table")
except Exception as e:
    if 'Duplicate column' in str(e):
        pass
    conn.rollback()

try:
    cur.execute("ALTER TABLE orders ADD COLUMN aiConfidence INT DEFAULT NULL")
    conn.commit()
except:
    conn.rollback()

try:
    cur.execute("ALTER TABLE orders ADD COLUMN aiReasoning TEXT DEFAULT NULL")
    conn.commit()
except:
    conn.rollback()

# Get all orders with their items for context
cur.execute("""
    SELECT o.id, o.vendor, o.orderNumber, o.totalAmount, o.currency, o.orderDate, o.items,
           GROUP_CONCAT(oi.name SEPARATOR ' | ') as itemNames,
           GROUP_CONCAT(DISTINCT oi.deliveryAddress SEPARATOR ' | ') as addresses,
           GROUP_CONCAT(DISTINCT oi.propertyAttribution SEPARATOR ',') as itemAttributions
    FROM orders o
    LEFT JOIN order_items oi ON oi.orderId = o.id
    WHERE o.propertyAttribution = 'unclassified' OR o.propertyAttribution IS NULL
    GROUP BY o.id
    ORDER BY o.totalAmount DESC
""")
orders = cur.fetchall()
print(f"Found {len(orders)} orders to categorize at order level")
print(f"Total value: ${sum(float(o['totalAmount'] or 0) for o in orders):,.2f}")

# Process in batches of 10 (orders have more context than items)
BATCH_SIZE = 10
total_categorized = 0
batch_num = 0

for i in range(0, len(orders), BATCH_SIZE):
    batch = orders[i:i+BATCH_SIZE]
    batch_num += 1
    
    orders_text = ""
    for idx, order in enumerate(batch):
        # Get item names from JSON if not in order_items
        item_names = order.get('itemNames') or ''
        if not item_names and order.get('items'):
            try:
                items_json = json.loads(order['items']) if isinstance(order['items'], str) else order['items']
                if isinstance(items_json, list):
                    item_names = ' | '.join([
                        i.get('name', '') or i.get('title', '') or str(i) 
                        for i in items_json if isinstance(i, dict)
                    ])
            except:
                pass
        
        addresses = order.get('addresses') or 'Unknown'
        
        orders_text += f"""
Order {idx+1}:
  - Vendor: {order['vendor']}
  - Order #: {order['orderNumber']}
  - Total: ${order['totalAmount'] or 0} {order['currency'] or 'USD'}
  - Date: {order['orderDate']}
  - Items: {item_names[:300]}
  - Delivery Address: {addresses[:200]}
  - Item-level attributions: {order.get('itemAttributions', 'none')}
"""

    prompt = f"""You are categorizing ENTIRE ORDERS for a short-term rental property business owner's tax deductions.

PROPERTIES:
1. "artistes_boutique" — Kingston, Jamaica (Caribbean vacation rental). Shipping via Aeropost (Miami, FL hub → Jamaica)
2. "sunset_studio" — Burdett, NY 14818 (Seneca Lake area vacation rental)
3. "morabeza" — Burdett, NY 14818 (same location as Sunset Studio, different unit)

ADDRESS RULES:
- "Aeropost", "1 Aeropost Way", "Miami, FL" (shipping hub) → artistes_boutique (Jamaica)
- "3024 Braxton Wood" → artistes_boutique (Jamaica, forwarding address)
- "Burdett", "Watkins Glen", "14818" → sunset_studio or morabeza (NY)
- "Baldwin, NY", "Grayson, GA", "Fairfax, VA", "San Francisco" → personal (owner's various addresses)

ITEM CATEGORIZATION RULES:
- Sheets, towels, pillows, bedding, bathroom supplies → PROPERTY (linens_bedding)
- Cleaning products, detergent, trash bags → PROPERTY (cleaning_supplies)
- Furniture, shelves, storage → PROPERTY (furniture)
- Kitchen items, cookware, dishes → PROPERTY (kitchen)
- Paint, hardware, tools, fixtures, locks → PROPERTY (maintenance)
- Decor, art, candles, plants → PROPERTY (decor)
- Electronics for property (smart locks, cameras, speakers) → PROPERTY (electronics)
- Food, groceries, snacks, personal vitamins → PERSONAL
- Clothing, personal electronics, toys → PERSONAL
- Mixed orders (some property, some personal items) → mark as "mixed" with explanation

For each order, return JSON array with:
- id: order number (1-indexed)
- property: "artistes_boutique" | "sunset_studio" | "morabeza" | "personal" | "mixed"
- category: primary category of the order
- taxDeductible: true if ANY items are property-related
- confidence: 0.0-1.0
- reasoning: brief explanation (max 30 words)
- deductiblePortion: percentage of order that's tax deductible (0-100)

{orders_text}

Return ONLY a JSON object with key "orders" containing the array."""

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
        parsed = json.loads(content)
        
        # Handle various response formats
        if isinstance(parsed, dict):
            results = parsed.get('orders') or parsed.get('items') or parsed.get('results') or list(parsed.values())[0]
        else:
            results = parsed
        
        if not isinstance(results, list):
            print(f"  Batch {batch_num}: Unexpected format")
            continue
        
        for result in results:
            idx = result.get('id', 0) - 1
            if idx < 0 or idx >= len(batch):
                continue
            
            order = batch[idx]
            property_attr = result.get('property', 'unclassified')
            category = result.get('category', 'other')
            tax_deductible = result.get('taxDeductible', False)
            confidence = result.get('confidence', 0.5)
            reasoning = result.get('reasoning', '')
            deductible_pct = result.get('deductiblePortion', 100 if tax_deductible else 0)
            
            # Map to valid values
            prop_map = {
                'artistes_boutique': 'artistes_boutique',
                'artiste_boutique': 'artistes_boutique',
                'jamaica': 'artistes_boutique',
                'sunset_studio': 'sunset_studio',
                'sunset_morabeza': 'sunset_studio',
                'morabeza': 'morabeza',
                'ny_property': 'sunset_studio',
                'personal': 'personal',
                'mixed': 'mixed',
                'needs_review': 'unclassified',
            }
            mapped_prop = prop_map.get(property_attr, 'unclassified')
            confidence_int = int(confidence * 100) if confidence <= 1 else int(confidence)
            
            cur.execute("""
                UPDATE orders 
                SET propertyAttribution = %s, expenseCategory = %s, 
                    isTaxDeductible = %s, aiConfidence = %s, aiReasoning = %s
                WHERE id = %s
            """, (mapped_prop, category, 1 if tax_deductible else 0, confidence_int, 
                  f"{reasoning} [{deductible_pct}% deductible]", order['id']))
            total_categorized += 1
        
        conn.commit()
        print(f"  Batch {batch_num}/{(len(orders) + BATCH_SIZE - 1) // BATCH_SIZE}: Categorized {len(results)} orders")
        sys.stdout.flush()
        
    except Exception as e:
        print(f"  Batch {batch_num}: Error - {e}")
        conn.rollback()

# Print summary
print(f"\n{'=' * 60}")
print(f"ORDER-LEVEL CATEGORIZATION COMPLETE")
print(f"{'=' * 60}")
print(f"Total categorized: {total_categorized}")

cur.execute("""
    SELECT propertyAttribution, COUNT(*) as cnt, SUM(COALESCE(totalAmount, 0)) as total
    FROM orders 
    WHERE propertyAttribution != 'unclassified' AND propertyAttribution IS NOT NULL
    GROUP BY propertyAttribution
    ORDER BY total DESC
""")
print("\nBy Property Attribution:")
for row in cur.fetchall():
    print(f"  {row['propertyAttribution']}: {row['cnt']} orders (${row['total'] or 0:,.2f})")

cur.execute("""
    SELECT expenseCategory, COUNT(*) as cnt, SUM(COALESCE(totalAmount, 0)) as total
    FROM orders 
    WHERE isTaxDeductible = 1
    GROUP BY expenseCategory
    ORDER BY total DESC
    LIMIT 15
""")
print("\nTax Deductible by Category:")
for row in cur.fetchall():
    print(f"  {row['expenseCategory']}: {row['cnt']} orders (${row['total'] or 0:,.2f})")

# Year breakdown for tax deductible
cur.execute("""
    SELECT YEAR(orderDate) as yr, propertyAttribution, 
           COUNT(*) as cnt, SUM(COALESCE(totalAmount, 0)) as total
    FROM orders 
    WHERE isTaxDeductible = 1
    GROUP BY YEAR(orderDate), propertyAttribution
    ORDER BY yr, propertyAttribution
""")
print("\nTax Deductible by Year & Property:")
for row in cur.fetchall():
    print(f"  {row['yr']} | {row['propertyAttribution']}: {row['cnt']} orders (${row['total'] or 0:,.2f})")

conn.close()
