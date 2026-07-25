# Prompt for the Manus agent (geeveslifebeta.manus.space)

Paste this into the Manus workspace that owns the geeves.life beta app, together
with the `editsApi.ts` file:

---

Add the attached `editsApi.ts` to the server code (e.g. `server/editsApi.ts`) and
wire it into the Express app in `server/_core/index.ts`, **before** the tRPC
middleware is registered:

```ts
import { editsApiRouter } from "../editsApi";
// ...inside startServer(), after body parsing is set up, before tRPC:
app.use("/api", express.json(), editsApiRouter);
```

(If `express.json()` is already applied globally, just `app.use("/api", editsApiRouter)`.)

Then set a new environment variable and redeploy:

- `EDIT_SECRET=26Tjpfam!!!%`   (the shared secret the reconciliation explorer sends)
- `DATABASE_URL` is already configured — the router reuses it.

After redeploy, verify with:

```bash
curl https://geeveslifebeta.manus.space/api/health
# -> {"ok":true,"db":"up"}

curl -X POST https://geeveslifebeta.manus.space/api/edits \
  -H 'Content-Type: application/json' \
  -d '{"secret":"26Tjpfam!!!%","edits":[{"txn_id":5144,"to":"PERS","meta":{"desc":"test","amount":42.42,"date":"2022-12-25","currency":"USD"}}]}'
# -> {"ok":true,"applied":1,...}

curl -X POST https://geeveslifebeta.manus.space/api/edits \
  -H 'Content-Type: application/json' \
  -d '{"secret":"wrong","edits":[{"txn_id":5144,"to":"PERS"}]}'
# -> 401 {"ok":false,"error":"bad secret"}
```

Once the tests pass, tell me "edits API live" — no UI changes are needed; the
reconciliation explorer will be pointed at
`https://geeveslifebeta.manus.space` on my side.

## What this API does (context for the agent)

The Maxfield Reconciliation Explorer (static site) pushes categorization edits
directly into the `transactions` table. Staged rows are identified by
`notes LIKE 'GEE-<stagingTxnId>%'`. The API applies, in one DB transaction per
request:

- **edits[]** — whole-transaction vertical reassignment (MB/MM/BL/GL/SO/BLab/FAM/PERS/REV)
- **splits[]** — multi-line splits with per-line `category` (→ `expenseCategory`),
  `class` and `location` (→ notes segments); lines must sum to the txn amount to the cent
- **field_edits[]** — txn-level QBO fields updated in place: `cat`→`expenseCategory`,
  `vendor`→`vendor`, `tax`→`taxCategory`, and `cls`/`loc`/`cust`/`bill`/`markup`/`memo`/`tags`
  as notes segments (only provided keys touched; empty string clears). Existing
  `Class: body|mind|soul` quick-tag memos must be preserved — only QBO class values
  (`Bohemian Lodges`, `Maxfield Market`) are replaced.

Reassign/split is DELETE + re-insert keyed on the GEE notes prefix (idempotent),
preserving `bankAccountId`, `description`, `amount`, `currency`, `vendor`,
`transactionDate` from the existing row. Every mutation writes an `edit_log`
audit row (table auto-created). CORS is open on these routes because the
explorer is hosted on a different origin. The reference implementation (tested
against the beta database) is `geeves_edits_api/main.py`; `editsApi.ts` is a
faithful TypeScript port.

## Rollback

Remove the mount line and the file, unset `EDIT_SECRET`, redeploy.
