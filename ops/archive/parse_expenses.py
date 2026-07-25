"""
Parse expense emails (Amazon, Walmart, Venmo) to extract property-related expenses.
Uses the built-in LLM proxy for structured extraction.
"""
import json
import concurrent.futures as cf
from openai import OpenAI

client = OpenAI()

# Load expense emails
with open('raw_data/gmail_expenses_2025.json') as f:
    data = json.load(f)

amazon_orders = data.get('amazon_orders', [])
walmart_orders = data.get('walmart_orders', [])
venmo_payments = data.get('venmo_payments', [])

print(f"Amazon orders: {len(amazon_orders)}")
print(f"Walmart orders: {len(walmart_orders)}")
print(f"Venmo payments: {len(venmo_payments)}")

EXPENSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "expense_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "is_property_related": {"type": "boolean", "description": "True if this expense is likely related to rental property management (cleaning supplies, maintenance, furniture, linens, toiletries, repairs, property services, vendor payments for property work)"},
                "date": {"type": "string", "description": "Date of purchase/payment (YYYY-MM-DD)"},
                "vendor": {"type": "string", "description": "Vendor/store name"},
                "total_amount": {"type": "number", "description": "Total amount in USD"},
                "items_description": {"type": "string", "description": "Brief description of items purchased or service paid for"},
                "category": {"type": "string", "description": "Category: supplies, cleaning, maintenance, furniture, linens, toiletries, repairs, utilities, services, vendor_payment, personal, groceries, other"},
                "likely_property": {"type": "string", "description": "If property-related, which property is it likely for: Morabeza, Sunset Studio, Artistes Boutique, General (all properties), or Unknown"}
            },
            "required": ["is_property_related", "date", "vendor", "total_amount", "items_description", "category", "likely_property"],
            "additionalProperties": False
        }
    }
}

def parse_expense(email):
    """Parse a single expense email."""
    try:
        body_text = email.get('body', '')[:6000]
        resp = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": """Extract expense data from this email. Determine if it's property-related for short-term rental properties (Airbnb/Vrbo/Booking.com) in Upstate New York or Jamaica.

Property-related expenses include:
- Cleaning supplies, laundry detergent, trash bags
- Linens, towels, bedding, pillows
- Toiletries (soap, shampoo, toilet paper)
- Furniture, decor, kitchenware
- Maintenance items (light bulbs, batteries, tools)
- Repairs and services
- Vendor payments for cleaning, handyman, landscaping
- Smart home devices (locks, cameras, thermostats)
- Property management software/subscriptions

NOT property-related:
- Personal groceries, clothing, electronics for personal use
- Kids items, school supplies
- Personal subscriptions (streaming, etc.)
- Restaurant/food delivery for personal consumption

If it's a Venmo payment, check if the description suggests property services (cleaning, maintenance, repairs, etc.)."""},
                {"role": "user", "content": f"Subject: {email['subject']}\nDate: {email['date']}\nFrom: {email['from']}\n\nBody:\n{body_text}"}
            ],
            response_format=EXPENSE_SCHEMA
        )
        result = json.loads(resp.choices[0].message.content)
        result['_email_id'] = email['id']
        result['_source'] = 'amazon' if 'amazon' in email.get('from', '').lower() else 'walmart' if 'walmart' in email.get('from', '').lower() else 'venmo'
        return result
    except Exception as e:
        return {"error": str(e), "_email_id": email.get('id'), "_source": "unknown", "is_property_related": False}

# Combine all expense emails
all_expenses = []
for e in amazon_orders:
    e['_type'] = 'amazon'
    all_expenses.append(e)
for e in walmart_orders:
    e['_type'] = 'walmart'
    all_expenses.append(e)
for e in venmo_payments:
    e['_type'] = 'venmo'
    all_expenses.append(e)

print(f"\nTotal expense emails to parse: {len(all_expenses)}")
print("Parsing expenses (this may take a few minutes)...")

results = []
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    futures = {ex.submit(parse_expense, email): i for i, email in enumerate(all_expenses)}
    for future in cf.as_completed(futures):
        idx = futures[future]
        result = future.result()
        results.append(result)
        if len(results) % 25 == 0:
            print(f"  Parsed {len(results)}/{len(all_expenses)}")

# Save all parsed results
with open('parsed/expenses_all_parsed.json', 'w') as f:
    json.dump(results, f, indent=2)

# Filter property-related
property_expenses = [r for r in results if r.get('is_property_related') and 'error' not in r]
personal_expenses = [r for r in results if not r.get('is_property_related') and 'error' not in r]

print(f"\n=== SUMMARY ===")
print(f"Total parsed: {len(results)}")
print(f"Property-related: {len(property_expenses)}")
print(f"Personal/non-property: {len(personal_expenses)}")
print(f"Errors: {sum(1 for r in results if 'error' in r)}")

# Property expenses by category
by_category = {}
for e in property_expenses:
    cat = e.get('category', 'other')
    if cat not in by_category:
        by_category[cat] = {'count': 0, 'total': 0}
    by_category[cat]['count'] += 1
    by_category[cat]['total'] += e.get('total_amount', 0)

print("\nProperty Expenses by Category:")
total_property = 0
for cat, data in sorted(by_category.items(), key=lambda x: -x[1]['total']):
    print(f"  {cat}: {data['count']} items, ${data['total']:,.2f}")
    total_property += data['total']
print(f"\nTotal Property Expenses: ${total_property:,.2f}")

# Save property expenses separately
with open('parsed/property_expenses_parsed.json', 'w') as f:
    json.dump(property_expenses, f, indent=2)

print("\nDone! Saved to parsed/expenses_all_parsed.json and parsed/property_expenses_parsed.json")
