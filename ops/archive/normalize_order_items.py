"""
Normalize existing orders' JSON items into the order_items table.
This processes all orders that have items in JSON but haven't been broken into order_items rows.
"""
import mysql.connector
import json
from urllib.parse import urlparse

DB_URL = 'mysql://b5BH3wQgpo1xgCj.b8506ae6a7bf:bj248Kd2H6fw4TfWRxwN@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/mhfpBZgGttr5P7pgfv7LpQ?ssl={"rejectUnauthorized":true}'
p = urlparse(DB_URL)
conn = mysql.connector.connect(host=p.hostname, port=p.port or 3306, user=p.username, password=p.password, database=p.path[1:], ssl_disabled=False)
cur = conn.cursor(dictionary=True)

# Get all orders that have items JSON but no order_items rows
cur.execute("""
    SELECT o.id, o.items, o.platform, o.currency, o.orderDate
    FROM orders o
    LEFT JOIN order_items oi ON oi.orderId = o.id
    WHERE o.items IS NOT NULL AND o.items != '[]' AND o.items != 'null'
    GROUP BY o.id
    HAVING COUNT(oi.id) = 0
""")
orders = cur.fetchall()
print(f"Found {len(orders)} orders with items JSON but no order_items rows")

total_items = 0
errors = 0

for order in orders:
    try:
        items_data = order['items']
        if isinstance(items_data, str):
            items = json.loads(items_data)
        else:
            items = items_data
        
        if not isinstance(items, list):
            continue
            
        for item in items:
            if not item:
                continue
            
            # Handle different item formats from different sources
            name = None
            quantity = 1
            unit_price = None
            asin = None
            
            if isinstance(item, dict):
                name = item.get('name') or item.get('title') or item.get('productName') or item.get('description')
                quantity = item.get('quantity') or item.get('qty') or 1
                unit_price = item.get('unitPrice') or item.get('price') or item.get('amount')
                asin = item.get('asin') or item.get('productId')
                
                # Try to parse price if it's a string
                if isinstance(unit_price, str):
                    unit_price = unit_price.replace('$', '').replace(',', '').strip()
                    try:
                        unit_price = float(unit_price)
                    except:
                        unit_price = None
                        
                if isinstance(quantity, str):
                    try:
                        quantity = int(quantity)
                    except:
                        quantity = 1
            elif isinstance(item, str):
                name = item
            
            if not name:
                continue
            
            line_total = float(unit_price) * quantity if unit_price else None
            currency = order.get('currency') or 'USD'
            delivery_address = None  # Not stored at order level, may be in item JSON
            
            cur.execute("""
                INSERT INTO order_items (orderId, name, quantity, unitPrice, lineTotal, currency,
                                        vendorProductId, asin, deliveryAddress, propertyAttribution)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                order['id'],
                str(name)[:500],
                quantity,
                unit_price,
                line_total,
                currency,
                None,
                asin,
                delivery_address,
                'unclassified'
            ))
            total_items += 1
        
        conn.commit()
        
    except Exception as e:
        errors += 1
        if errors <= 5:
            print(f"  Error on order {order['id']}: {e}")
        conn.rollback()

print(f"\nNormalization complete:")
print(f"  Orders processed: {len(orders)}")
print(f"  Items created: {total_items}")
print(f"  Errors: {errors}")

# Summary stats
cur.execute("SELECT COUNT(*) as cnt FROM order_items")
print(f"\nTotal order_items in database: {cur.fetchone()['cnt']}")

cur.execute("""
    SELECT propertyAttribution, COUNT(*) as cnt 
    FROM order_items 
    GROUP BY propertyAttribution
""")
print("\nBy attribution:")
for row in cur.fetchall():
    print(f"  {row['propertyAttribution']}: {row['cnt']}")

# Check for Jamaica-related addresses
cur.execute("""
    SELECT COUNT(*) as cnt FROM order_items 
    WHERE deliveryAddress LIKE '%Aeropost%' 
       OR deliveryAddress LIKE '%3024 Braxton%'
       OR deliveryAddress LIKE '%Kingston%'
       OR deliveryAddress LIKE '%Jamaica%'
""")
print(f"\nItems with Jamaica/property delivery address: {cur.fetchone()['cnt']}")

# Check delivery addresses that exist
cur.execute("""
    SELECT DISTINCT deliveryAddress FROM order_items 
    WHERE deliveryAddress IS NOT NULL AND deliveryAddress != ''
    LIMIT 20
""")
print("\nSample delivery addresses found:")
for row in cur.fetchall():
    addr = row['deliveryAddress']
    if addr:
        print(f"  {addr[:100]}")

conn.close()
