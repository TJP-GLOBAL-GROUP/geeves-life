"""
Parse Gmail MCP search results and extract relevant expense emails for Artiste's Boutique 2024.
"""
import json, sys

result_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/manus-mcp/mcp_result_e2d64b55-5118-4229-ae4d-0d64dc5e7c70.json'

with open(result_file) as f:
    d = json.load(f)

threads = d.get('result', {}).get('threads', [])
print(f'Total threads: {len(threads)}\n')

# Keywords that indicate property expense relevance
RELEVANT_KEYWORDS = [
    'jps', 'jamaica public service', 'electricity', 'light bill',
    'nwc', 'national water', 'water bill',
    'digicel', 'flow', 'internet', 'cable',
    'mortgage', 'scotiabank', 'scotia',
    'pool', 'maintenance', 'repair', 'cleaning',
    'juta', 'taxi', 'transport',
    'insurance', 'property',
    'artiste', 'boutique', 'bohemian',
    'amber pay', 'amberpay', 'payment summary',
    'receipt', 'invoice', 'bill',
]

relevant = []
for thread in threads:
    for msg in thread.get('messages', []):
        subject = msg.get('subject', '') or ''
        snippet = msg.get('snippet', '') or ''
        sender = msg.get('from', '') or ''
        date = msg.get('date', '') or ''
        attachments = msg.get('attachments', []) or []
        
        # Check relevance
        text_to_check = (subject + ' ' + snippet + ' ' + sender).lower()
        is_relevant = any(kw in text_to_check for kw in RELEVANT_KEYWORDS)
        
        if is_relevant:
            relevant.append({
                'id': msg.get('id'),
                'threadId': msg.get('threadId'),
                'date': date,
                'subject': subject,
                'from': sender,
                'snippet': snippet[:150],
                'attachments': [a.get('filename', '') for a in attachments],
                'attachmentPaths': [a.get('savedPath', '') for a in attachments],
            })

print(f'Relevant expense emails: {len(relevant)}\n')
print('=' * 80)
for e in relevant:
    att_str = ', '.join(e['attachments']) if e['attachments'] else 'none'
    print(f"[{e['date'][:20]}] {e['subject'][:70]}")
    print(f"  From: {e['from'][:60]}")
    print(f"  Attachments: {att_str}")
    if e['attachmentPaths']:
        for p in e['attachmentPaths']:
            print(f"  Path: {p}")
    print()

# Save to JSON for further processing
with open('/home/ubuntu/upload/relevant_emails_2024.json', 'w') as f:
    json.dump(relevant, f, indent=2)
print(f'\nSaved to /home/ubuntu/upload/relevant_emails_2024.json')
