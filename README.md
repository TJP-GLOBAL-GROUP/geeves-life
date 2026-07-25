# Geeves.Life — Master Codebase

Family-office ERP: expense categorization & QBO integration, booking/calendar shadow-block
engine, Guardian governance system, and the Reconciliation Explorer write-back Edits API.

## Layout
- `server/` — Express + tRPC backend (incl. `server/editsApi.ts` — Explorer write-back)
- `client/` — React frontend
- `drizzle/` — schema + migrations
- `ops/archive/` — one-off operational scripts (audits, backfills, ingestion) — **not runtime**
- `docs/` — plans, handovers, governance specs

## Merge provenance (2026-07-25 consolidation)
Baseline: migrated tree; exceptions: ICS double-booking hotfixes (orig), Edits API + Guardian
wiring + trust-proxy (Kimi payload), registerStorageProxy (migrated, union-merged).
See `docs/merge-provenance.md`.
