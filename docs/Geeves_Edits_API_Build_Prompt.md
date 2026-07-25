# Build Prompt — Geeves.life "Edits API" (categorization write-back service)

> Hand this prompt to a developer or AI coding agent working in the geeves.life codebase.
> It specifies a small, self-contained write-back API that lets the Maxfield
> Reconciliation Explorer push categorization edits directly into the geeves
> MySQL/TiDB database (`geeves_beta` first, then `geeves_live` after verification).

---

## Context

Geeves.life is a Next.js + tRPC + Drizzle ORM app backed by a MySQL-compatible
database (TiDB Cloud / Cloud SQL MySQL). A separate static web tool (the
"Reconciliation Explorer") is used to categorize ~12,000 staged transactions.
Those staged rows already exist in the `transactions` table, identifiable by a
`notes` field that begins with `GEE-<stagingTxnId>` (e.g. `GEE-5144 L1/2 | Vertical: MM | ...`).

We need an API that accepts categorization edits from that tool and applies them
to the `transactions` table immediately, with an audit trail. Implement it as API
routes inside the geeves.life app (e.g. Next.js route handlers or tRPC
procedures — your choice), or as a small standalone service if that's cleaner.

## Endpoints

### `GET /api/health`
Returns `{ "ok": true, "db": "up" }` after running `SELECT 1`. 503 on failure.

### `POST /api/edits`
Applies a batch of edits in ONE database transaction (all-or-nothing).

**Auth:** shared secret. Reject with 401 unless `body.secret === process.env.EDIT_SECRET`.

**Request body:**

```json
{
  "secret": "<EDIT_SECRET>",
  "edits": [
    { "txn_id": 5144, "to": "PERS",
      "meta": { "desc": "AMAZON.COM", "amount": 42.42, "date": "2022-12-25",
                "vendor": "Amazon", "currency": "USD" } }
  ],
  "splits": [
    { "txn_id": 20,
      "meta": { "desc": "SPIRIT AIRLINES", "amount": 69.95, "date": "2023-08-01",
                "vendor": "", "currency": "USD" },
      "lines": [
        { "vertical": "PERS", "amount": 23.78, "memo": "", "category": "", "class": "", "location": "" },
        { "vertical": "MM",   "amount": 23.09, "memo": "", "category": "6130 Supplies",
          "class": "Maxfield Market", "location": "" },
        { "vertical": "BL",   "amount": 23.08, "memo": "", "category": "", "class": "", "location": "" }
      ] }
  ],
  "field_edits": [
    { "txn_id": 1, "meta": { "desc": "...", "amount": 42.42, "date": "2022-12-25", "vendor": "", "currency": "USD" },
      "fields": { "cat": "6130 Supplies", "cls": "Bohemian Lodges", "loc": "Morabeza Suite",
                  "cust": "", "bill": "yes", "markup": "15", "vendor": "", "tax": "GCT15",
                  "memo": "", "tags": ["Tag: Autism Support"] } }
  ]
}
```

All three arrays are optional but at least one must be non-empty. `meta` is a
fallback used only when no existing row is found in the DB.

**Validation (reject whole batch with 400 on any violation):**
- every `to` / `vertical` ∈ {MB, MM, BL, GL, SO, BLab, FAM, PERS, REV}
- for each split: `sum(lines.amount)` must equal the transaction amount to the cent (±0.004)

**Write semantics for `edits` (whole-transaction vertical reassignment) and `splits`:**

1. Find existing rows: `SELECT ... FROM transactions WHERE notes LIKE 'GEE-<txn_id>%'`.
   Preserve `bankAccountId`, `description`, `amount`, `currency`, `vendor`,
   `transactionDate` from the existing first row; fall back to `meta` if absent.
2. `DELETE FROM transactions WHERE notes LIKE 'GEE-<txn_id>%'` (this makes the
   operation idempotent — re-syncing the same edit replaces, never duplicates).
3. Insert replacement rows, one per line (an `edits` item is a single line at the
   full amount). For each line, at ordinal i of N:
   - `userId`: 1
   - `amount`: `abs(line.amount)`; `type`: 'expense'; `currency`: from step 1 (default 'USD')
   - `classification`: 'personal' if vertical ∈ {FAM, PERS}, else 'business'
   - `expenseCategory`: `line.category` if given, else 'Uncategorized'
   - `vendor`: from step 1
   - `isManualOverride`: 0; `platform`: 'staging'
   - `notes`: `GEE-<txn_id> L<i>/<N> | Vertical: <V>` then optional segments:
     - ` | <memo>` if line.memo (strip newlines)
     - ` | Class: <class>` if line.class
     - ` | Loc: <location>` if line.location
     - ` | NEEDS REVIEW` if vertical is REV (always last)
   - `id`: assign from `SELECT COALESCE(MAX(id),0)+1` (or use AUTO_INCREMENT)
4. Insert an audit row into `edit_log` (create the table if absent — schema below):
   `gee_txn='GEE-<txn_id>'`, `field='vertical/split'`, `old_value` = previous
   `Vertical: X` parsed from the old notes, `new_value` = new vertical or
   `SPLIT MM $23.09 + ...`, `edited_by='explorer-api'`, `reason='direct sync'`.

**Write semantics for `field_edits` (txn-level QBO fields — UPDATE in place, do NOT delete/reinsert):**

For each of the transaction's existing `GEE-<txn_id>%` rows:
- `fields.cat` → `expenseCategory` column (empty string → 'Uncategorized')
- `fields.vendor` → `vendor` column (empty → NULL)
- `fields.tax` → `taxCategory` column (empty → NULL)
- the rest are merged into `notes` as pipe-separated segments, replacing any
  existing segment of the same kind and inserting before a trailing `NEEDS REVIEW`:
  - `cls` → `Class: <value>` — IMPORTANT: only replace an existing `Class:` segment
    if its value is a QBO class (`Bohemian Lodges` or `Maxfield Market`); memo
    quick-tags like `Class: body` / `Class: mind` / `Class: soul` are user tags and
    must be preserved
  - `loc` → `Loc: <value>`; `cust` → `Cust: <value>`; `memo` → `Memo: <value>`
  - `bill`: 'yes' → `Billable: yes` (append ` (+<markup>% markup)` if markup set); 'no' → `Billable: no`
  - `tags` (array) → `Tags: <comma-joined>`
- only keys PRESENT in `fields` are touched; an empty-string value clears that segment/column
- write one `edit_log` row per txn: `field='qbo-fields'`, `new_value` = JSON of the fields object

**Response:** `{ "ok": true, "applied": <txns touched>, "deleted": <old rows>, "inserted": <new rows> }`
On any error: rollback everything, return 500 `{ "ok": false, "error": "<type>: <message>" }`.

### `GET /api/edit-log?limit=50`
Returns the most recent audit rows: `{ "ok": true, "rows": [{txn, from, to, by, at}] }`.

## edit_log table (create if absent)

```sql
CREATE TABLE IF NOT EXISTS edit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gee_txn VARCHAR(32) NOT NULL,
  field VARCHAR(32), old_value TEXT, new_value TEXT,
  edited_by VARCHAR(64), reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
```

## CORS & config

- Enable CORS for all origins on these routes (the explorer is a static page on a
  different domain; it does a cross-origin POST with `Content-Type: application/json`).
- Config via env: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (default `geeves_beta`), `EDIT_SECRET`.

## Acceptance tests

```bash
# 1. health
curl https://<host>/api/health            # -> {"ok":true,"db":"up"}

# 2. reassign txn 5144 to PERS
curl -X POST https://<host>/api/edits -H 'Content-Type: application/json' -d '{
  "secret":"<EDIT_SECRET>",
  "edits":[{"txn_id":5144,"to":"PERS","meta":{"desc":"test","amount":42.42,"date":"2022-12-25","currency":"USD"}}]
}'   # -> {"ok":true,"applied":1,...}; row notes now start "GEE-5144 L1/1 | Vertical: PERS"

# 3. idempotency: run the same call again — same result, no duplicate rows

# 4. field edit: sets expenseCategory + notes segments in place
curl -X POST https://<host>/api/edits -H 'Content-Type: application/json' -d '{
  "secret":"<EDIT_SECRET>",
  "field_edits":[{"txn_id":5144,"fields":{"cat":"6130 Supplies","loc":"Morabeza Suite","bill":"yes","markup":"15"}}]
}'   # expenseCategory='6130 Supplies', notes contain "| Loc: Morabeza Suite | Billable: yes (+15% markup)"

# 5. wrong secret -> 401
```

## Reference implementation

A complete, tested reference implementation in Python/FastAPI (~150 lines,
including the notes-segment merging logic) exists in the delivered
`geeves_edits_api/main.py` — port it faithfully if building natively, or deploy
it as-is to Cloud Run.
