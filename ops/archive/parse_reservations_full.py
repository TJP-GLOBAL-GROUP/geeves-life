"""
Parse Airbnb reservation confirmation emails to extract FULL financial details.
Based on the email format shown in the screenshot:
- Guest name, guest count
- Property name, listing type
- Check-in / Check-out dates and times
- Confirmation code
- Guest paid breakdown (nightly rate x nights, cleaning fee, service fee, taxes, total)
- Host payout breakdown (room fee, cleaning fee, adjustments, host service fee, taxes, you earn)
"""
import json
import concurrent.futures as cf
from openai import OpenAI

client = OpenAI()

# Load emails - combine both lists and deduplicate
with open('raw_data/gmail_airbnb_us_2025.json') as f:
    data = json.load(f)

all_emails = [*data['airbnb_payouts'], *data['airbnb_reservations']]
seen = set()
unique = []
for e in all_emails:
    if e['id'] not in seen:
        seen.add(e['id'])
        unique.append(e)

# Filter to reservation confirmations only
confirmations = [e for e in unique if 'Reservation confirmed' in e.get('subject', '')]
print(f"Found {len(confirmations)} reservation confirmation emails to parse")

RESERVATION_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "airbnb_reservation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "guest_name": {"type": "string", "description": "Full name of the guest"},
                "guest_count": {"type": "integer", "description": "Number of guests (adults + children)"},
                "guest_details": {"type": "string", "description": "Guest details like '11 adults' or '2 adults, 1 child'"},
                "property_name": {"type": "string", "description": "Property/listing name as shown in email"},
                "listing_type": {"type": "string", "description": "Type like 'Entire home/apt' or 'Private room'"},
                "check_in_date": {"type": "string", "description": "Check-in date (YYYY-MM-DD)"},
                "check_in_time": {"type": "string", "description": "Check-in time (e.g. '5:00 PM')"},
                "check_out_date": {"type": "string", "description": "Check-out date (YYYY-MM-DD)"},
                "check_out_time": {"type": "string", "description": "Check-out time (e.g. '10:00 AM')"},
                "num_nights": {"type": "integer", "description": "Number of nights"},
                "confirmation_code": {"type": "string", "description": "Airbnb confirmation code (e.g. HMEHSZ9XT8)"},
                "guest_paid": {
                    "type": "object",
                    "description": "What the guest paid",
                    "properties": {
                        "nightly_rate": {"type": "number", "description": "Per-night rate"},
                        "room_subtotal": {"type": "number", "description": "Nightly rate x nights"},
                        "cleaning_fee": {"type": "number", "description": "Cleaning fee charged to guest"},
                        "guest_service_fee": {"type": "number", "description": "Airbnb guest service fee"},
                        "occupancy_taxes": {"type": "number", "description": "Occupancy/property use taxes"},
                        "other_fees": {"type": "number", "description": "Any other fees"},
                        "total_usd": {"type": "number", "description": "Total amount guest paid in USD"}
                    },
                    "required": ["nightly_rate", "room_subtotal", "cleaning_fee", "guest_service_fee", "occupancy_taxes", "other_fees", "total_usd"],
                    "additionalProperties": False
                },
                "host_payout": {
                    "type": "object",
                    "description": "Host payout breakdown",
                    "properties": {
                        "room_fee": {"type": "number", "description": "Room fee (nights x rate, may differ from guest paid)"},
                        "cleaning_fee": {"type": "number", "description": "Cleaning fee passed to host"},
                        "nightly_rate_adjustment": {"type": "number", "description": "Any nightly rate adjustment (can be negative)"},
                        "host_service_fee": {"type": "number", "description": "Airbnb host service fee (usually negative, e.g. -$71.92)"},
                        "host_service_fee_percent": {"type": "number", "description": "Host service fee percentage (e.g. 3.0)"},
                        "property_use_taxes": {"type": "number", "description": "Property use taxes passed through"},
                        "you_earn": {"type": "number", "description": "Final amount host earns (net payout)"}
                    },
                    "required": ["room_fee", "cleaning_fee", "nightly_rate_adjustment", "host_service_fee", "host_service_fee_percent", "property_use_taxes", "you_earn"],
                    "additionalProperties": False
                },
                "currency": {"type": "string", "description": "Currency (usually USD)"},
                "cancellation_policy": {"type": "string", "description": "Cancellation policy (e.g. Firm, Flexible, Moderate)"},
                "guest_country": {"type": "string", "description": "Guest's country if mentioned"},
                "guest_message": {"type": "string", "description": "Any message from the guest included in the email"}
            },
            "required": ["guest_name", "guest_count", "guest_details", "property_name", "listing_type", 
                        "check_in_date", "check_in_time", "check_out_date", "check_out_time", "num_nights",
                        "confirmation_code", "guest_paid", "host_payout", "currency", 
                        "cancellation_policy", "guest_country", "guest_message"],
            "additionalProperties": False
        }
    }
}

def parse_reservation(email):
    """Parse a single reservation confirmation email."""
    try:
        body_text = email.get('body', '')[:10000]
        resp = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": """Extract ALL financial and booking details from this Airbnb reservation confirmation email.

The email contains:
1. Guest name and country
2. Property name and type
3. Check-in/Check-out dates and times
4. Number of guests
5. Confirmation code
6. GUEST PAID section: nightly rate x nights, cleaning fee, guest service fee, occupancy taxes, total
7. HOST PAYOUT section: room fee, cleaning fee, adjustments, host service fee (%), property use taxes, YOU EARN amount

Extract every number precisely. Dates should be YYYY-MM-DD format.
If a field is not present, use 0 for numbers and empty string for strings.
The host service fee is typically shown as negative (e.g., -$71.92) — store it as a negative number."""},
                {"role": "user", "content": f"Subject: {email['subject']}\nDate: {email['date']}\n\nEmail Body:\n{body_text}"}
            ],
            response_format=RESERVATION_SCHEMA
        )
        result = json.loads(resp.choices[0].message.content)
        result['_email_id'] = email['id']
        result['_email_subject'] = email['subject']
        result['_email_date'] = email['date']
        return result
    except Exception as e:
        return {"error": str(e), "_email_id": email.get('id'), "_email_subject": email.get('subject')}

# Parse all confirmation emails
print("\nParsing reservation confirmations...")
results = []
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    futures = {ex.submit(parse_reservation, email): i for i, email in enumerate(confirmations)}
    for future in cf.as_completed(futures):
        result = future.result()
        results.append(result)
        if len(results) % 5 == 0:
            print(f"  Parsed {len(results)}/{len(confirmations)}")

# Sort by check-in date
results.sort(key=lambda x: x.get('check_in_date', ''))

# Save
with open('parsed/airbnb_reservations_full.json', 'w') as f:
    json.dump(results, f, indent=2)

# Summary
print(f"\n{'='*60}")
print(f"AIRBNB RESERVATION PARSING SUMMARY")
print(f"{'='*60}")
errors = [r for r in results if 'error' in r]
valid = [r for r in results if 'error' not in r]
print(f"Total parsed: {len(results)}")
print(f"Successful: {len(valid)}")
print(f"Errors: {len(errors)}")

total_guest_paid = sum(r['guest_paid']['total_usd'] for r in valid)
total_host_earn = sum(r['host_payout']['you_earn'] for r in valid)
total_commission = sum(abs(r['host_payout']['host_service_fee']) for r in valid)
total_cleaning = sum(r['guest_paid']['cleaning_fee'] for r in valid)
total_taxes = sum(r['guest_paid']['occupancy_taxes'] for r in valid)

print(f"\nFinancial Totals:")
print(f"  Total Guest Paid:     ${total_guest_paid:,.2f}")
print(f"  Total Host Earns:     ${total_host_earn:,.2f}")
print(f"  Total Platform Fees:  ${total_commission:,.2f}")
print(f"  Total Cleaning Fees:  ${total_cleaning:,.2f}")
print(f"  Total Taxes Collected: ${total_taxes:,.2f}")

# By property
by_property = {}
for r in valid:
    prop = r.get('property_name', 'Unknown')
    if prop not in by_property:
        by_property[prop] = {'count': 0, 'guest_paid': 0, 'host_earn': 0, 'nights': 0}
    by_property[prop]['count'] += 1
    by_property[prop]['guest_paid'] += r['guest_paid']['total_usd']
    by_property[prop]['host_earn'] += r['host_payout']['you_earn']
    by_property[prop]['nights'] += r.get('num_nights', 0)

print(f"\nBy Property:")
for prop, data in sorted(by_property.items()):
    print(f"  {prop}:")
    print(f"    Bookings: {data['count']}, Nights: {data['nights']}")
    print(f"    Guest Paid: ${data['guest_paid']:,.2f}, Host Earns: ${data['host_earn']:,.2f}")

# Show individual bookings
print(f"\nDetailed Bookings:")
for r in valid:
    print(f"  {r['check_in_date']} - {r['check_out_date']} | {r['guest_name']} ({r['guest_count']} guests) | {r['property_name']}")
    print(f"    Code: {r['confirmation_code']} | Guest Paid: ${r['guest_paid']['total_usd']:,.2f} | Host Earns: ${r['host_payout']['you_earn']:,.2f} | Fee: ${abs(r['host_payout']['host_service_fee']):,.2f}")

print(f"\nDone! Saved to parsed/airbnb_reservations_full.json")
