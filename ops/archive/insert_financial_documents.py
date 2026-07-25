"""
Insert financial_documents records for all uploaded expense evidence documents.
Maps each document to the correct documentType, vertical, and taxYear.
"""

import json
import mysql.connector
import os
import re
import uuid
import datetime
from pathlib import Path

# DB connection
DB_URL = os.environ.get('DATABASE_URL', '')

def parse_db_url(url):
    """Parse mysql://user:pass@host:port/dbname?params"""
    import re
    m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', url)
    if not m:
        raise ValueError(f'Cannot parse DB URL: {url[:50]}')
    return {
        'user': m.group(1),
        'password': m.group(2),
        'host': m.group(3),
        'port': int(m.group(4)),
        'database': m.group(5).split('?')[0],
        'ssl_disabled': False,
    }

HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9'
PROPERTY_ID = 'ZI2Zy7OuLGYF-vmWOAII-'

# Map category to document metadata
# vertical enum: personal, artistes_boutique, morabeza, sunset_studio, maxfield_bakery, multi
# documentType enum: bank_statement, credit_card_statement, receipt, invoice, email_evidence, airbnb_report, vrbo_report, booking_report, tax_document, other
CATEGORY_META = {
    'jps_bills': {
        'documentType': 'invoice',
        'vertical': 'artistes_boutique',
        'description_prefix': 'JPS Electricity Bill',
    },
    'nwc_water': {
        'documentType': 'invoice',
        'vertical': 'artistes_boutique',
        'description_prefix': 'NWC Water Bill',
    },
    'digicel_flow': {
        'documentType': 'invoice',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Digicel/Flow Internet Bill',
    },
    'pool_maintenance': {
        'documentType': 'receipt',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Pool/Maintenance',
    },
    'juta_transport': {
        'documentType': 'receipt',
        'vertical': 'artistes_boutique',
        'description_prefix': 'JUTA Transport',
    },
    'insurance': {
        'documentType': 'other',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Insurance',
    },
    'mortgage_scotia': {
        'documentType': 'other',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Mortgage/Scotia',
    },
    'airbnb_income': {
        'documentType': 'airbnb_report',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Airbnb Income',
    },
    'property_expenses': {
        'documentType': 'receipt',
        'vertical': 'artistes_boutique',
        'description_prefix': 'Property Expense',
    },
}

def extract_date_from_filename(filename):
    """Extract date from filename like 20240119_..."""
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', filename)
    if m:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime.date(year, month, day)
        except ValueError:
            pass
    return None

def main():
    # Load S3 upload results
    with open('/home/ubuntu/upload/s3_upload_results.json') as f:
        s3_results = json.load(f)
    
    # Connect to DB
    db_params = parse_db_url(DB_URL)
    conn = mysql.connector.connect(
        host=db_params['host'],
        port=db_params['port'],
        user=db_params['user'],
        password=db_params['password'],
        database=db_params['database'],
        ssl_disabled=False,
        connection_timeout=30,
    )
    cursor = conn.cursor()
    
    inserted = 0
    skipped = 0
    errors = 0
    
    # Track all inserted document IDs for later matching
    doc_records = []
    
    for category, docs in s3_results.items():
        meta = CATEGORY_META.get(category, {
            'documentType': 'other',
            'vertical': 'rental_property',
            'description_prefix': category,
        })
        
        print(f'\n[{category}] {len(docs)} documents')
        
        for doc in docs:
            if not doc.get('s3Url'):
                skipped += 1
                continue
            
            filename = doc['filename']
            s3_url = doc['s3Url']
            s3_key = doc['s3Key']
            
            # Extract date from filename
            doc_date = extract_date_from_filename(filename)
            doc_year = doc_date.year if doc_date else 2024
            doc_month = doc_date.month if doc_date else None
            
            # Determine if this is a 2024 document
            tax_year = doc_year if doc_year in (2024, 2025, 2026) else 2024
            
            description = f"{meta['description_prefix']} - {filename}"
            
            try:
                cursor.execute("""
                    INSERT INTO financial_documents 
                    (householdId, documentType, documentDate, description, 
                     s3Key, s3Url, originalFilename, vertical, 
                     statementYear, statementMonth, taxYear, createdAt, updatedAt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """, (
                    HOUSEHOLD_ID,
                    meta['documentType'],
                    doc_date.isoformat() if doc_date else None,
                    description[:255],
                    s3_key,
                    s3_url,
                    filename,
                    meta['vertical'],
                    doc_year,
                    doc_month,
                    tax_year,
                ))
                doc_id = cursor.lastrowid
                
                doc_records.append({
                    'id': int(doc_id),
                    'category': category,
                    'filename': filename,
                    'date': doc_date.isoformat() if doc_date else None,
                    'year': doc_year,
                    'month': doc_month,
                    's3Url': s3_url,
                })
                
                inserted += 1
                
            except mysql.connector.Error as e:
                print(f'  ERROR inserting {filename}: {e}')
                errors += 1
    
    conn.commit()
    cursor.close()
    conn.close()
    
    # Save doc records for later matching
    with open('/home/ubuntu/upload/financial_documents_inserted.json', 'w') as f:
        json.dump(doc_records, f, indent=2)
    
    print(f'\n\n=== SUMMARY ===')
    print(f'Inserted: {inserted}')
    print(f'Skipped: {skipped}')
    print(f'Errors: {errors}')
    print(f'Records saved to: /home/ubuntu/upload/financial_documents_inserted.json')

if __name__ == '__main__':
    main()
