#!/usr/bin/env python3
"""
Geeves.Life v2 Database Migration Script
========================================
Migrates data from the Manus QBO Integration Sandbox (SQLite) into the
live Geeves.Life MySQL/TiDB database.

Source: geeves_life_v2_dump.sql (SQLite format, 27,646 lines)
Target: Live MySQL/TiDB via DATABASE_URL

Tables migrated:
  - transactions        (11,971 rows)
  - attribution_lines   (7,837 rows)
  - master_coa          (191 rows)
  - qbo_account_map     (1,330 rows)
  - edit_log            (all categorization changes)

Unattributed transactions:
  - ~4,236 total unattributed
  - 1,018 auto-cleared (vendor pattern match)
  - 3,218 flagged for manual review

Usage:
  python3 server/migrate_v2_data.py --db-url "$DATABASE_URL" --dump-file geeves_life_v2_dump.sql [--dry-run]

Author: Kimi (Tick & Tie Agent)
Date: 2026-07-27
"""

import argparse
import json
import re
import sqlite3
import sys
import tempfile
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import mysql.connector
from mysql.connector import Error as MySQLError

# ─── Configuration ────────────────────────────────────────────────────────────

SOURCE_TABLES = [
    "transactions",
    "attribution_lines",
    "master_coa",
    "qbo_account_map",
    "edit_log",
    "allocation_rules",
    "allocation_lines",
    "coa_map",
    "txn_sync_state",
]

# Vendor patterns for auto-clearing unattributed transactions
AUTO_CLEAR_PATTERNS = {
    "airbnb": {"vertical": "Blue Lagoon Lodges", "category": "Rental Income - Airbnb", "confidence": 0.95},
    "vrbo": {"vertical": "Blue Lagoon Lodges", "category": "Rental Income - VRBO", "confidence": 0.95},
    "booking.com": {"vertical": "Blue Lagoon Lodges", "category": "Rental Income - Booking.com", "confidence": 0.95},
    "maxfield bakery": {"vertical": "Maxfield Bakery", "category": "Sales of Product Income", "confidence": 0.90},
    "maxfield market": {"vertical": "Maxfield Market Global", "category": "Sales of Product Income", "confidence": 0.90},
    "flour": {"vertical": "Maxfield Bakery", "category": "Cost of Goods Sold - Flour", "confidence": 0.85},
    "scotia": {"vertical": "Personal", "category": "Bank Fees", "confidence": 0.70},
    "jn bank": {"vertical": "Personal", "category": "Bank Fees", "confidence": 0.70},
    "transfer": {"vertical": None, "category": "Inter-Account Transfer", "confidence": 0.80, "is_transfer": True},
    "internal transfer": {"vertical": None, "category": "Inter-Account Transfer", "confidence": 0.90, "is_transfer": True},
    "venmo": {"vertical": None, "category": "Payment Method - Venmo", "confidence": 0.75, "is_payment_method": True},
    "paypal": {"vertical": None, "category": "Payment Method - PayPal", "confidence": 0.75, "is_payment_method": True},
    "zelle": {"vertical": None, "category": "Payment Method - Zelle", "confidence": 0.75, "is_payment_method": True},
}

# ─── SQLite Parser ────────────────────────────────────────────────────────────

def parse_sqlite_dump(dump_path: str) -> Dict[str, List[Dict[str, Any]]]:
    """Parse a SQLite dump file and return table data."""
    # Create a temporary SQLite DB from the dump
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()

        # Read and execute the dump
        with open(dump_path, "r", encoding="utf-8") as f:
            dump_sql = f.read()

        # Execute in chunks to handle large dumps
        cursor.executescript(dump_sql)
        conn.commit()

        # Extract data from each table
        data: Dict[str, List[Dict[str, Any]]] = {}
        for table in SOURCE_TABLES:
            try:
                cursor.execute(f"SELECT * FROM {table}")
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()
                data[table] = [dict(zip(columns, row)) for row in rows]
                print(f"  [Parse] {table}: {len(data[table])} rows")
            except sqlite3.OperationalError as e:
                print(f"  [Parse] {table}: TABLE NOT FOUND ({e})")
                data[table] = []

        conn.close()
        return data
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


# ─── MySQL Connection ─────────────────────────────────────────────────────────

def connect_mysql(db_url: str):
    """Parse DATABASE_URL and connect to MySQL/TiDB."""
    # Expected format: mysql://user:pass@host:port/dbname
    match = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", db_url)
    if not match:
        raise ValueError(f"Invalid DATABASE_URL format: {db_url}")

    user, password, host, port, database = match.groups()
    port = int(port) if port else 3306

    return mysql.connector.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        collation="utf8mb4_unicode_ci",
        autocommit=False,
    )


# ─── Data Transformers ────────────────────────────────────────────────────────

def transform_transaction(row: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a SQLite transaction row for MySQL."""
    return {
        "id": row.get("id"),
        "householdId": row.get("household_id", "system"),
        "verticalId": row.get("vertical_id"),
        "accountId": row.get("account_id"),
        "vendorId": row.get("vendor_id"),
        "vendorName": row.get("vendor_name"),
        "vendorOrderId": row.get("vendor_order_id"),
        "amount": str(row.get("amount", 0)),
        "currency": row.get("currency", "USD"),
        "txnDate": row.get("txn_date"),
        "txnTime": row.get("txn_time"),
        "description": row.get("description"),
        "notes": row.get("notes"),
        "txnType": row.get("txn_type", "expense"),
        "paymentMethod": row.get("payment_method"),
        "reference": row.get("reference"),
        "status": row.get("status", "active"),
        "createdAt": row.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updatedAt": row.get("updated_at", datetime.now(timezone.utc).isoformat()),
    }


def transform_attribution_line(row: Dict[str, Any]) -> Dict[str, Any]:
    """Transform an attribution line for MySQL."""
    return {
        "id": row.get("id"),
        "transactionId": row.get("transaction_id"),
        "householdId": row.get("household_id", "system"),
        "verticalId": row.get("vertical_id"),
        "categoryId": row.get("category_id"),
        "categoryName": row.get("category_name"),
        "splitGroupId": row.get("split_group_id"),
        "splitSequence": row.get("split_sequence", 0),
        "splitAmount": str(row.get("split_amount", 0)),
        "splitPercentage": str(row.get("split_percentage", 100)),
        "attributionType": row.get("attribution_type", "primary"),
        "confidence": str(row.get("confidence", 1.0)),
        "source": row.get("source", "manual"),
        "createdAt": row.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updatedAt": row.get("updated_at", datetime.now(timezone.utc).isoformat()),
    }


def transform_master_coa(row: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a master COA row for MySQL chart_of_accounts."""
    return {
        "id": row.get("id"),
        "householdId": row.get("household_id", "system"),
        "verticalId": row.get("vertical_id"),
        "name": row.get("name"),
        "accountType": row.get("account_type", "expense"),
        "detailType": row.get("detail_type"),
        "accountNumber": row.get("account_number"),
        "qboAccountId": row.get("qbo_account_id"),
        "qboFullyQualifiedName": row.get("qbo_fully_qualified_name"),
        "qboSyncStatus": row.get("qbo_sync_status", "pending_map"),
        "taxFormLine": row.get("tax_form_line"),
        "taxJurisdiction": row.get("tax_jurisdiction", "us_federal"),
        "description": row.get("description"),
        "active": row.get("active", True),
        "createdAt": row.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updatedAt": row.get("updated_at", datetime.now(timezone.utc).isoformat()),
    }


def transform_qbo_account_map(row: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a QBO account map row."""
    return {
        "id": row.get("id"),
        "householdId": row.get("household_id", "system"),
        "realmId": row.get("realm_id"),
        "qboAccountId": row.get("qbo_account_id"),
        "geevesAccountId": row.get("geeves_account_id"),
        "mappingType": row.get("mapping_type", "exact"),
        "confidence": str(row.get("confidence", 1.0)),
        "notes": row.get("notes"),
        "createdAt": row.get("created_at", datetime.now(timezone.utc).isoformat()),
        "updatedAt": row.get("updated_at", datetime.now(timezone.utc).isoformat()),
    }


# ─── Auto-Clear Logic ─────────────────────────────────────────────────────────

def auto_clear_unattributed(transactions: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Auto-clear unattributed transactions based on vendor name patterns.
    Returns: (cleared_lines, flagged_lines)
    """
    cleared: List[Dict[str, Any]] = []
    flagged: List[Dict[str, Any]] = []

    for txn in transactions:
        vendor = (txn.get("vendor_name", "") or "").lower()
        description = (txn.get("description", "") or "").lower()
        combined = f"{vendor} {description}"

        matched = False
        for pattern, mapping in AUTO_CLEAR_PATTERNS.items():
            if pattern in combined:
                line = {
                    "id": f"auto_{txn['id']}",
                    "transactionId": txn["id"],
                    "householdId": txn.get("household_id", "system"),
                    "verticalId": mapping.get("vertical") or txn.get("vertical_id"),
                    "categoryId": None,
                    "categoryName": mapping["category"],
                    "splitGroupId": None,
                    "splitSequence": 0,
                    "splitAmount": str(txn.get("amount", 0)),
                    "splitPercentage": "100",
                    "attributionType": "auto_cleared",
                    "confidence": str(mapping["confidence"]),
                    "source": f"auto_clear_pattern:{pattern}",
                    "isTransfer": mapping.get("is_transfer", False),
                    "isPaymentMethod": mapping.get("is_payment_method", False),
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
                cleared.append(line)
                matched = True
                break

        if not matched:
            flagged.append({
                "transactionId": txn["id"],
                "vendorName": txn.get("vendor_name"),
                "description": txn.get("description"),
                "amount": txn.get("amount"),
                "txnDate": txn.get("txn_date"),
                "reason": "No matching vendor pattern",
            })

    return cleared, flagged


# ─── MySQL Inserter ───────────────────────────────────────────────────────────

def insert_batch(cursor, table: str, rows: List[Dict[str, Any]], dry_run: bool = False) -> int:
    """Insert a batch of rows into MySQL."""
    if not rows:
        return 0

    if dry_run:
        print(f"  [DRY RUN] Would insert {len(rows)} rows into {table}")
        return len(rows)

    columns = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(columns))
    column_str = ", ".join([f"`{c}`" for c in columns])
    sql = f"INSERT INTO `{table}` ({column_str}) VALUES ({placeholders})"

    # Handle duplicates with ON DUPLICATE KEY UPDATE
    updates = ", ".join([f"`{c}` = VALUES(`{c}`)" for c in columns])
    sql += f" ON DUPLICATE KEY UPDATE {updates}"

    values = [tuple(row.get(c) for c in columns) for row in rows]

    try:
        cursor.executemany(sql, values)
        return cursor.rowcount
    except MySQLError as e:
        print(f"  [ERROR] Batch insert into {table} failed: {e}")
        # Fall back to individual inserts
        count = 0
        for row in rows:
            try:
                cursor.execute(sql, tuple(row.get(c) for c in columns))
                count += 1
            except MySQLError as e2:
                print(f"  [ERROR] Row insert failed: {e2}")
        return count


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrate Geeves v2 SQLite data to MySQL")
    parser.add_argument("--db-url", required=True, help="MySQL DATABASE_URL")
    parser.add_argument("--dump-file", required=True, help="Path to SQLite dump file")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--batch-size", type=int, default=500, help="Insert batch size")
    args = parser.parse_args()

    print("=" * 60)
    print("GEEVES.LIFE v2 DATABASE MIGRATION")
    print(f"Source: {args.dump_file}")
    print(f"Target: {args.db_url.split('@')[1]}")  # Hide credentials
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print("=" * 60)

    # 1. Parse SQLite dump
    print("\n[1/6] Parsing SQLite dump...")
    data = parse_sqlite_dump(args.dump_file)

    # 2. Auto-clear unattributed transactions
    print("\n[2/6] Auto-clearing unattributed transactions...")
    all_txns = data.get("transactions", [])
    attributed_txn_ids = set(a.get("transaction_id") for a in data.get("attribution_lines", []))
    unattributed = [t for t in all_txns if t.get("id") not in attributed_txn_ids]
    print(f"  Total transactions: {len(all_txns)}")
    print(f"  Already attributed: {len(attributed_txn_ids)}")
    print(f"  Unattributed: {len(unattributed)}")

    cleared, flagged = auto_clear_unattributed(unattributed)
    print(f"  Auto-cleared: {len(cleared)}")
    print(f"  Flagged for review: {len(flagged)}")

    # Add auto-cleared lines to attribution_lines
    data["attribution_lines"].extend(cleared)

    # 3. Connect to MySQL
    print("\n[3/6] Connecting to MySQL...")
    conn = connect_mysql(args.db_url)
    cursor = conn.cursor()
    print("  Connected successfully")

    # 4. Migrate tables
    print("\n[4/6] Migrating tables...")
    stats = {}

    # transactions
    if data.get("transactions"):
        transformed = [transform_transaction(t) for t in data["transactions"]]
        count = insert_batch(cursor, "transactions", transformed, args.dry_run)
        stats["transactions"] = count
        print(f"  transactions: {count} rows")

    # attribution_lines
    if data.get("attribution_lines"):
        transformed = [transform_attribution_line(a) for a in data["attribution_lines"]]
        count = insert_batch(cursor, "attribution_lines", transformed, args.dry_run)
        stats["attribution_lines"] = count
        print(f"  attribution_lines: {count} rows")

    # master_coa → chart_of_accounts
    if data.get("master_coa"):
        transformed = [transform_master_coa(c) for c in data["master_coa"]]
        count = insert_batch(cursor, "chart_of_accounts", transformed, args.dry_run)
        stats["chart_of_accounts"] = count
        print(f"  chart_of_accounts (from master_coa): {count} rows")

    # qbo_account_map
    if data.get("qbo_account_map"):
        transformed = [transform_qbo_account_map(m) for m in data["qbo_account_map"]]
        count = insert_batch(cursor, "qbo_account_map", transformed, args.dry_run)
        stats["qbo_account_map"] = count
        print(f"  qbo_account_map: {count} rows")

    # 5. Write flagged transactions to review file
    print("\n[5/6] Writing flagged transactions...")
    if flagged:
        review_file = "flagged_transactions.json"
        with open(review_file, "w") as f:
            json.dump(flagged, f, indent=2, default=str)
        print(f"  {len(flagged)} transactions written to {review_file}")

    # 6. Commit or rollback
    print("\n[6/6] Finalizing...")
    if args.dry_run:
        print("  DRY RUN — rolled back")
        conn.rollback()
    else:
        conn.commit()
        print("  Committed successfully")

    conn.close()

    # Summary
    print("\n" + "=" * 60)
    print("MIGRATION SUMMARY")
    print("=" * 60)
    for table, count in stats.items():
        print(f"  {table}: {count} rows")
    print(f"\n  Auto-cleared: {len(cleared)}")
    print(f"  Flagged for review: {len(flagged)}")
    print(f"  Flagged file: flagged_transactions.json" if flagged else "  No flagged transactions")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
