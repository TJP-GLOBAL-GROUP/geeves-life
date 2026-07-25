"""
Match expense evidence documents to property_expense_records and update supportingDocUrl.

Matching strategy:
- JPS bills: match by month/year to UTILITIES records with paidTo='JPS'
- NWC water: match by month/year to UTILITIES records with paidTo='NWC'
- Digicel/Flow: match by month/year to UTILITIES records with paidTo like 'Digicel' or 'Flow'
- Pool/maintenance: match by month/year to MAINTENANCE records with paidTo like 'pool' or 'Water Crystal'
- Airbnb: match by month/year to INCOME records
- Property expenses: match by date proximity to any expense record
"""

import json
import mysql.connector
import os
import re
import datetime

DB_URL = os.environ.get('DATABASE_URL', '')

def parse_db_url(url):
    m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', url)
    if not m:
        raise ValueError(f'Cannot parse DB URL')
    return {
        'user': m.group(1),
        'password': m.group(2),
        'host': m.group(3),
        'port': int(m.group(4)),
        'database': m.group(5).split('?')[0],
    }

HOUSEHOLD_ID = 'V8lk3KJatvxBTWURf4uo9'

def main():
    # Load inserted documents
    with open('/home/ubuntu/upload/financial_documents_inserted.json') as f:
        doc_records = json.load(f)
    
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
    cursor = conn.cursor(dictionary=True)
    
    # Load all 2024 Artiste's Boutique expense records
    cursor.execute("""
        SELECT id, expenseDate, expenseYear, expenseMonth, category, amountJMD, paidTo, 
               documentId, supportingDocUrl
        FROM property_expense_records 
        WHERE property = 'artistes_boutique' AND expenseYear = 2024
        ORDER BY expenseDate
    """)
    expense_records = cursor.fetchall()
    print(f'Loaded {len(expense_records)} 2024 expense records')
    
    # Group documents by category and month
    docs_by_cat_month = {}
    for doc in doc_records:
        if doc['year'] != 2024:
            continue
        key = (doc['category'], doc['month'])
        if key not in docs_by_cat_month:
            docs_by_cat_month[key] = []
        docs_by_cat_month[key].append(doc)
    
    # Matching rules
    CATEGORY_MATCH_RULES = {
        'jps_bills': {
            'expense_categories': ['UTILITIES'],
            'paid_to_patterns': ['JPS', 'Jamaica Public Service'],
        },
        'nwc_water': {
            'expense_categories': ['UTILITIES'],
            'paid_to_patterns': ['NWC', 'National Water'],
        },
        'digicel_flow': {
            'expense_categories': ['UTILITIES'],
            'paid_to_patterns': ['Digicel', 'Flow', 'FLOW', 'digicel'],
        },
        'pool_maintenance': {
            'expense_categories': ['MAINTENANCE'],
            'paid_to_patterns': ['pool', 'Pool', 'Water Crystal', 'Home and Garden'],
        },
        'property_expenses': {
            'expense_categories': ['MAINTENANCE', 'REPAIRS', 'CLEANING FEE', 'SUPPLIES'],
            'paid_to_patterns': [],  # Match any
        },
        'airbnb_income': {
            'expense_categories': ['INCOME', 'AIRBNB'],
            'paid_to_patterns': ['Airbnb', 'airbnb'],
        },
        'insurance': {
            'expense_categories': ['INSURANCE'],
            'paid_to_patterns': [],
        },
    }
    
    matched = 0
    unmatched_docs = []
    match_log = []
    
    for doc in doc_records:
        if doc['year'] != 2024:
            continue
        
        category = doc['category']
        doc_month = doc['month']
        doc_date = doc['date']
        
        rules = CATEGORY_MATCH_RULES.get(category)
        if not rules:
            continue
        
        # Find matching expense records
        best_match = None
        for expense in expense_records:
            exp_month = expense['expenseMonth']
            exp_cat = expense['category'].upper()
            exp_paid_to = (expense['paidTo'] or '').upper()
            
            # Check category match
            cat_match = any(ec.upper() in exp_cat or exp_cat in ec.upper() 
                          for ec in rules['expense_categories'])
            if not cat_match:
                continue
            
            # Check paidTo match (if patterns specified)
            if rules['paid_to_patterns']:
                paid_match = any(p.upper() in exp_paid_to or exp_paid_to in p.upper()
                               for p in rules['paid_to_patterns'])
                if not paid_match:
                    continue
            
            # Check month match (within 1 month tolerance)
            if doc_month and exp_month:
                if abs(doc_month - exp_month) > 1:
                    continue
            
            # Skip if already has a document
            if expense['documentId'] and expense['supportingDocUrl']:
                continue
            
            best_match = expense
            break
        
        if best_match:
            # Update the expense record
            cursor.execute("""
                UPDATE property_expense_records 
                SET documentId = %s, supportingDocUrl = %s, isReconciled = 1
                WHERE id = %s
            """, (doc['id'], doc['s3Url'], best_match['id']))
            
            match_log.append({
                'doc_id': doc['id'],
                'doc_filename': doc['filename'],
                'doc_date': doc['date'],
                'expense_id': best_match['id'],
                'expense_date': str(best_match['expenseDate'])[:10],
                'expense_category': best_match['category'],
                'expense_paidTo': best_match['paidTo'],
                'expense_amount': str(best_match['amountJMD']),
                's3Url': doc['s3Url'],
            })
            
            matched += 1
            # Mark this expense as matched
            best_match['documentId'] = doc['id']
            best_match['supportingDocUrl'] = doc['s3Url']
        else:
            unmatched_docs.append({
                'doc_id': doc['id'],
                'filename': doc['filename'],
                'category': category,
                'date': doc['date'],
            })
    
    conn.commit()
    cursor.close()
    conn.close()
    
    # Save match log
    with open('/home/ubuntu/upload/document_match_log.json', 'w') as f:
        json.dump({
            'matched': match_log,
            'unmatched': unmatched_docs,
        }, f, indent=2)
    
    print(f'\n=== MATCHING SUMMARY ===')
    print(f'Documents matched to expenses: {matched}')
    print(f'Documents unmatched: {len(unmatched_docs)}')
    print(f'Match log saved to: /home/ubuntu/upload/document_match_log.json')
    
    # Show matched by category
    from collections import Counter
    cat_counts = Counter(m['doc_filename'].split('_')[0] for m in match_log)
    print('\nMatched by document date:')
    for cat, count in sorted(cat_counts.items()):
        print(f'  {cat}: {count}')

if __name__ == '__main__':
    main()
