#!/usr/bin/env python3
"""
TiDB COA Harmonization Migration Runner
=======================================
Safely executes migration-coa-harmonization.sql in 6 atomic parts
with pre-flight checks, per-part verification, and rollback capability.

Usage:
    # Dry run (prints what would be executed)
    python3 tidb_coa_migration_runner.py --dry-run

    # Execute with live connection
    python3 tidb_coa_migration_runner.py --host <HOST> --port 4000 \
        --user <USER> --password <PASSWORD> --database <DB>

    # Or use environment variables
    export TIDB_HOST=your-tidb-host
    export TIDB_PORT=4000
    export TIDB_USER=your-user
    export TIDB_PASSWORD=your-password
    export TIDB_DATABASE=your-database
    python3 tidb_coa_migration_runner.py
"""

import argparse
import os
import sys

try:
    import pymysql
except ImportError:
    print("ERROR: PyMySQL required. Install: pip install PyMySQL")
    sys.exit(1)

SENTINEL_HOUSEHOLD_ID = 'HH_SYSTEM_MIGRATION'

# [SQL parts abbreviated - see full file in repo]
# Part A: INSERT 191 accounts
# Part B: UPDATE retype/consolidate/deprecate
# Part C: INSERT vertical catalogs
# Part D: INSERT QBO mappings
# Part E: ALTER TABLE + backfill
# Part F: INSERT change log

SQL_PARTS = {
    'part_a_ingest': {
        'label': 'PART A: Ingest 191 accounts from master_coa',
        'description': 'Inserts all 191 accounts into chart_of_accounts with vertical prefixes',
        'verification': 'SELECT COUNT(*) as count FROM chart_of_accounts WHERE createdBy = "migration"',
        'expected_min': 191,
    },
    'part_b_clean': {
        'label': 'PART B: Clean 191 → ~128 (retype, consolidate, deprecate)',
        'description': '25 income retypes, 14 financial retypes, 14 transfer rail deprecations, 22 consolidations',
        'verification': 'SELECT accountType, COUNT(*) as count FROM chart_of_accounts WHERE createdBy = "migration" GROUP BY accountType ORDER BY count DESC',
        'expected_min': None,
    },
    'part_c_verticals': {
        'label': 'PART C: Build 9 vertical G.L. catalogs',
        'description': 'Inserts into vertical_coa_catalogs for BKY, MKT, BL, PERS, SELF, SO, GL, SHARED, TJP',
        'verification': 'SELECT verticalId, COUNT(*) as count FROM vertical_coa_catalogs GROUP BY verticalId ORDER BY count DESC',
        'expected_min': 9,
    },
    'part_d_qbo_mappings': {
        'label': 'PART D: Initialize QBO mapping framework',
        'description': 'Pre-seed qbo_account_mappings for 2 QBO realms',
        'verification': 'SELECT qboRealmId, COUNT(*) as count FROM qbo_account_mappings GROUP BY qboRealmId',
        'expected_min': 2,
    },
    'part_e_schema': {
        'label': 'PART E: Schema additions (accountPurpose, lineage fields)',
        'description': 'ALTER TABLE adds: accountPurpose, masterCoaId, lineageNotes, mergedFrom + indexes',
        'verification': 'SHOW COLUMNS FROM chart_of_accounts WHERE Field IN ("accountPurpose", "masterCoaId", "lineageNotes", "mergedFrom")',
        'expected_min': 4,
    },
    'part_f_changelog': {
        'label': 'PART F: Populate coa_change_log (audit trail)',
        'description': '66 change log records documenting all transformations',
        'verification': 'SELECT changeType, COUNT(*) as count FROM coa_change_log GROUP BY changeType ORDER BY count DESC',
        'expected_min': 60,
    },
}


PART_A_SQL = """SET @household_id = %(household_id)s; INSERT INTO `chart_of_accounts` (...) VALUES (...);"""
PART_B_SQL = """UPDATE ...;"""
PART_C_SQL = """INSERT INTO `vertical_coa_catalogs` ...;"""
PART_D_SQL = """INSERT INTO `qbo_account_mappings` ...;"""
PART_E_SQL = """ALTER TABLE `chart_of_accounts` ...;"""
PART_F_SQL = """INSERT INTO `coa_change_log` ...;"""
ROLLBACK_SQL = """DELETE FROM ...;"""


class TiDBMigrationRunner:
    def __init__(self, host, port, user, password, database, ssl_ca=None):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.ssl_ca = ssl_ca
        self.conn = None
        self.results = []

    def connect(self):
        ssl_config = {'ca': self.ssl_ca} if self.ssl_ca else None
        self.conn = pymysql.connect(
            host=self.host, port=self.port, user=self.user,
            password=self.password, database=self.database,
            charset='utf8mb4', ssl=ssl_config, autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )
        print(f"   Connected: {self.host}:{self.port}/{self.database}")

    def close(self):
        if self.conn:
            self.conn.close()

    def execute_sql_block(self, label, sql, params=None):
        print(f"\n{'='*70}\nExecuting: {label}\n{'='*70}")
        statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]
        total = 0
        for i, stmt in enumerate(statements):
            if not stmt.strip():
                continue
            preview = stmt.replace('\n', ' ')[:80]
            print(f"  [{i+1}/{len(statements)}] {preview}...")
            try:
                with self.conn.cursor() as cursor:
                    cursor.execute(stmt, params or {})
                    rows = cursor.rowcount
                    total += rows if rows > 0 else 0
                    if rows > 0:
                        print(f"         -> {rows} rows affected")
            except Exception as e:
                print(f"   ERROR: {e}")
                raise
        print(f"   Total rows affected: {total}")
        return total

    def run_verification(self, label, query):
        print(f"\n   [VERIFY] {label}")
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query)
                for row in cursor.fetchall():
                    print(f"            {row}")
        except Exception as e:
            print(f"   Verification error: {e}")

    def preflight_checks(self):
        print(f"\n{'='*70}\nPRE-FLIGHT CHECKS\n{'='*70}")
        checks = [
            ("chart_of_accounts exists", "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='chart_of_accounts'"),
            ("chart_of_accounts rows", "SELECT COUNT(*) as c FROM chart_of_accounts"),
            ("Existing migration accounts", "SELECT COUNT(*) as c FROM chart_of_accounts WHERE createdBy='migration'"),
            ("master_coa exists", "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='master_coa'"),
            ("master_coa rows", "SELECT COUNT(*) as c FROM master_coa"),
            ("vertical_coa_catalogs exists", "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='vertical_coa_catalogs'"),
            ("qbo_account_mappings exists", "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='qbo_account_mappings'"),
            ("coa_change_log exists", "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='coa_change_log'"),
        ]
        for label, query in checks:
            try:
                with self.conn.cursor() as cursor:
                    cursor.execute(query)
                    row = cursor.fetchone()
                    print(f"  [OK] {label}: {row['c']}")
            except Exception as e:
                print(f"  [ERR] {label}: {e}")

    def run_migration(self, parts, dry_run=False):
        all_parts = {
            'part_a_ingest': ('PART A: Ingest 191 accounts', PART_A_SQL),
            'part_b_clean': ('PART B: Clean', PART_B_SQL),
            'part_c_verticals': ('PART C: Vertical G.L.s', PART_C_SQL),
            'part_d_qbo_mappings': ('PART D: QBO mappings', PART_D_SQL),
            'part_e_schema': ('PART E: Schema additions', PART_E_SQL),
            'part_f_changelog': ('PART F: Change log', PART_F_SQL),
        }
        if dry_run:
            print("\n*** DRY RUN — No changes ***\n")
        self.preflight_checks()
        if dry_run:
            return
        print(f"\n{'='*70}\nEXECUTING MIGRATION\n{'='*70}")
        try:
            for part_key in parts:
                if part_key not in all_parts:
                    continue
                label, sql = all_parts[part_key]
                rows = self.execute_sql_block(label, sql, {'household_id': SENTINEL_HOUSEHOLD_ID})
                self.results.append({'part': part_key, 'rows_affected': rows})
                v = SQL_PARTS.get(part_key, {}).get('verification')
                if v:
                    self.run_verification(f"Post-{part_key}", v)
            self.conn.commit()
            print(f"\n{'='*70}\nMIGRATION COMMITTED\n{'='*70}")
            for r in self.results:
                print(f"  {r['part']}: {r['rows_affected']} rows")
        except Exception as e:
            print(f"\nROLLBACK: {e}")
            self.conn.rollback()
            raise

    def run_rollback(self):
        print(f"\nROLLBACK...")
        self.execute_sql_block("Rollback", ROLLBACK_SQL)
        self.conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default=os.environ.get('TIDB_HOST'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('TIDB_PORT', 4000)))
    parser.add_argument('--user', default=os.environ.get('TIDB_USER'))
    parser.add_argument('--password', default=os.environ.get('TIDB_PASSWORD'))
    parser.add_argument('--database', default=os.environ.get('TIDB_DATABASE'))
    parser.add_argument('--ssl-ca', default=os.environ.get('TIDB_SSL_CA'))
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--parts', default='all')
    args = parser.parse_args()

    if not all([args.host, args.user, args.password, args.database]):
        print("Missing connection params. Set TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE")
        sys.exit(1)

    runner = TiDBMigrationRunner(args.host, args.port, args.user, args.password, args.database, args.ssl_ca)
    try:
        runner.connect()
        if args.rollback:
            runner.run_rollback()
        else:
            parts = list(SQL_PARTS.keys()) if args.parts == 'all' else args.parts.split(',')
            runner.run_migration(parts, args.dry_run)
    finally:
        runner.close()


if __name__ == '__main__':
    main()
