"""
Gmail API scraper for 2025 US property rental income emails.
Uses Google Service Account with domain-wide delegation to access tariqp@gmail.com.
Searches for: Booking.com payouts, Airbnb payouts, Vrbo/VRBO payouts.
"""
import os
import json
import base64
import re
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

# Load service account credentials from environment
SA_EMAIL = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
SA_KEY_RAW = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY', '')

TARGET_EMAIL = 'tariqp@gmail.com'
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_gmail_service():
    """Build Gmail service using service account with domain-wide delegation."""
    # Parse the service account key
    try:
        key_data = json.loads(SA_KEY_RAW)
    except json.JSONDecodeError:
        # Try base64 decode first
        try:
            key_data = json.loads(base64.b64decode(SA_KEY_RAW))
        except:
            print(f"ERROR: Cannot parse GOOGLE_SERVICE_ACCOUNT_KEY (length: {len(SA_KEY_RAW)})")
            print(f"First 50 chars: {SA_KEY_RAW[:50]}")
            return None
    
    credentials = service_account.Credentials.from_service_account_info(
        key_data,
        scopes=SCOPES,
        subject=TARGET_EMAIL  # Impersonate the target user
    )
    
    service = build('gmail', 'v1', credentials=credentials)
    return service

def search_messages(service, query, max_results=500):
    """Search Gmail messages with a query string."""
    messages = []
    page_token = None
    
    while True:
        params = {
            'userId': 'me',
            'q': query,
            'maxResults': min(max_results - len(messages), 100)
        }
        if page_token:
            params['pageToken'] = page_token
            
        result = service.users().messages().list(**params).execute()
        
        if 'messages' in result:
            messages.extend(result['messages'])
        
        page_token = result.get('nextPageToken')
        if not page_token or len(messages) >= max_results:
            break
    
    return messages

def get_message_details(service, msg_id):
    """Get full message details including headers and body."""
    msg = service.users().messages().get(
        userId='me', 
        id=msg_id, 
        format='full'
    ).execute()
    
    headers = {h['name']: h['value'] for h in msg['payload']['headers']}
    
    # Extract body text
    body = ''
    if 'parts' in msg['payload']:
        for part in msg['payload']['parts']:
            if part['mimeType'] == 'text/plain' and 'data' in part.get('body', {}):
                body += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
            elif part['mimeType'] == 'text/html' and 'data' in part.get('body', {}):
                if not body:  # Only use HTML if no plain text
                    body += base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
    elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
        body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8', errors='replace')
    
    return {
        'id': msg_id,
        'date': headers.get('Date', ''),
        'from': headers.get('From', ''),
        'subject': headers.get('Subject', ''),
        'snippet': msg.get('snippet', ''),
        'body': body[:5000]  # Limit body size
    }

def main():
    print("=" * 60)
    print("Gmail Income Scraper - US Properties 2025")
    print("=" * 60)
    print(f"\nTarget: {TARGET_EMAIL}")
    print(f"Service Account: {SA_EMAIL}")
    
    service = get_gmail_service()
    if not service:
        print("\nFAILED: Could not build Gmail service")
        return
    
    # Define search queries for income sources
    income_queries = {
        'airbnb': 'from:automated@airbnb.com subject:(payout OR payment OR reservation) after:2025/01/01 before:2026/01/01',
        'booking_com': 'from:noreply@booking.com (payout OR payment OR reservation OR confirmation) after:2025/01/01 before:2026/01/01',
        'vrbo': 'from:vrbo.com (payout OR payment OR reservation OR booking) after:2025/01/01 before:2026/01/01',
    }
    
    all_income_emails = {}
    
    for source, query in income_queries.items():
        print(f"\n--- Searching: {source} ---")
        print(f"Query: {query}")
        
        try:
            messages = search_messages(service, query)
            print(f"Found: {len(messages)} messages")
            
            details = []
            for i, msg in enumerate(messages[:50]):  # Limit to 50 per source
                try:
                    detail = get_message_details(service, msg['id'])
                    details.append(detail)
                    if i % 10 == 0:
                        print(f"  Processed {i+1}/{min(len(messages), 50)}")
                except Exception as e:
                    print(f"  Error on message {msg['id']}: {e}")
            
            all_income_emails[source] = details
            
        except Exception as e:
            print(f"ERROR searching {source}: {e}")
            all_income_emails[source] = []
    
    # Save results
    os.makedirs('/home/ubuntu/tax_prep/raw_data', exist_ok=True)
    output_path = '/home/ubuntu/tax_prep/raw_data/income_emails_2025.json'
    with open(output_path, 'w') as f:
        json.dump(all_income_emails, f, indent=2, default=str)
    
    print(f"\n\nResults saved to: {output_path}")
    print(f"Total emails found:")
    for source, emails in all_income_emails.items():
        print(f"  {source}: {len(emails)}")

if __name__ == '__main__':
    main()
