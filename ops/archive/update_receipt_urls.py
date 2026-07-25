"""
Parse the upload results and update the walmart_orders table with receipt URLs.
Also generate a JSON mapping for the spreadsheet update.
"""
import re
import json
import subprocess
import os

# Parse the upload results
url_mapping = {}
with open('/home/ubuntu/walmart_receipt_urls.txt') as f:
    for line in f:
        # Format: [SUCCESS] walmart_receipts/UUID.png -> /manus-storage/UUID_hash.png
        match = re.match(r'\[SUCCESS\] walmart_receipts/(.+?)\.png -> (.+)', line.strip())
        if match:
            order_id = match.group(1)
            storage_path = match.group(2)
            url_mapping[order_id] = storage_path

print(f"Parsed {len(url_mapping)} receipt URL mappings")

# Save as JSON for the Node.js DB update script
with open('/home/ubuntu/walmart_receipt_url_mapping.json', 'w') as f:
    json.dump(url_mapping, f)

print("Saved mapping to walmart_receipt_url_mapping.json")
