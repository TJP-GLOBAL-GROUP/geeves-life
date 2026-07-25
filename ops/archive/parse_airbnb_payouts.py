"""
Parse Airbnb payout emails to extract financial data.
Uses the built-in LLM proxy for structured extraction.
"""
import json
import concurrent.futures as cf
from openai import OpenAI

client = OpenAI()

# Load the Airbnb emails
with open('raw_data/gmail_airbnb_us_2025.json') as f:
    data = json.load(f)

# Filter to actual payout emails (contain dollar amounts in subject)
payout_emails = [e for e in data['airbnb_payouts'] if 'payout' in e['subject'].lower() or 'reimbursement' in e['subject'].lower()]
print(f"Found {len(payout_emails)} payout emails to parse")

# Also get reservation confirmation emails for property/date mapping
reservation_emails = [e for e in data['airbnb_reservations'] if 'confirmed' in e['subject'].lower() or 'Reservation confirmed' in e['subject']]
print(f"Found {len(reservation_emails)} reservation confirmation emails")

PAYOUT_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "airbnb_payout",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "payout_date": {"type": "string", "description": "Date payout was sent (YYYY-MM-DD)"},
                "total_amount": {"type": "number", "description": "Total payout amount in USD"},
                "currency": {"type": "string", "description": "Currency code (usually USD)"},
                "line_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "guest_name": {"type": "string", "description": "Guest name"},
                            "amount": {"type": "number", "description": "Amount for this line item"},
                            "description": {"type": "string", "description": "Description (e.g. Home, Pass Through Tot, Reimbursement)"},
                            "check_in": {"type": "string", "description": "Check-in date (YYYY-MM-DD) or empty"},
                            "check_out": {"type": "string", "description": "Check-out date (YYYY-MM-DD) or empty"},
                            "property_name": {"type": "string", "description": "Property name (e.g. Morabeza, Bohemian Lodge, Artist's Boutique, Sunset Studio)"},
                            "listing_id": {"type": "string", "description": "Listing ID number if present"},
                            "confirmation_code": {"type": "string", "description": "Reservation confirmation code if present"}
                        },
                        "required": ["guest_name", "amount", "description", "check_in", "check_out", "property_name", "listing_id", "confirmation_code"],
                        "additionalProperties": False
                    }
                },
                "payout_id": {"type": "string", "description": "Payout ID (e.g. G-XXXX)"},
                "bank_account": {"type": "string", "description": "Bank account info"}
            },
            "required": ["payout_date", "total_amount", "currency", "line_items", "payout_id", "bank_account"],
            "additionalProperties": False
        }
    }
}

def parse_payout(email):
    """Parse a single payout email."""
    try:
        body_text = email.get('body', '')[:8000]  # Limit body size
        resp = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": "Extract financial payout data from this Airbnb payout email. Return structured JSON with all line items. Dates should be YYYY-MM-DD format. If a field is not available, use empty string for strings and 0 for numbers."},
                {"role": "user", "content": f"Subject: {email['subject']}\nDate: {email['date']}\n\nBody:\n{body_text}"}
            ],
            response_format=PAYOUT_SCHEMA
        )
        result = json.loads(resp.choices[0].message.content)
        result['_email_id'] = email['id']
        result['_subject'] = email['subject']
        return result
    except Exception as e:
        return {"error": str(e), "_email_id": email.get('id'), "_subject": email.get('subject')}

# Parse payout emails in parallel
print("\nParsing payout emails...")
results = []
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    futures = {ex.submit(parse_payout, email): i for i, email in enumerate(payout_emails)}
    for future in cf.as_completed(futures):
        idx = futures[future]
        result = future.result()
        results.append(result)
        if (len(results)) % 10 == 0:
            print(f"  Parsed {len(results)}/{len(payout_emails)}")

# Sort by payout date
results.sort(key=lambda x: x.get('payout_date', ''))

# Save parsed results
with open('parsed/airbnb_payouts_parsed.json', 'w') as f:
    json.dump(results, f, indent=2)

# Summary
print(f"\n=== SUMMARY ===")
total_payouts = sum(r.get('total_amount', 0) for r in results if 'error' not in r)
errors = sum(1 for r in results if 'error' in r)
print(f"Total payouts parsed: {len(results) - errors}")
print(f"Errors: {errors}")
print(f"Total payout amount: ${total_payouts:,.2f}")

# Group by property
by_property = {}
for r in results:
    if 'error' in r:
        continue
    for item in r.get('line_items', []):
        prop = item.get('property_name', 'Unknown')
        if prop not in by_property:
            by_property[prop] = {'count': 0, 'total': 0}
        by_property[prop]['count'] += 1
        by_property[prop]['total'] += item.get('amount', 0)

print("\nBy Property:")
for prop, data in sorted(by_property.items()):
    print(f"  {prop}: {data['count']} line items, ${data['total']:,.2f}")

print("\nDone! Saved to parsed/airbnb_payouts_parsed.json")
