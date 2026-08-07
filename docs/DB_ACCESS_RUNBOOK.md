# DB Access Runbook — Geeves.Life

Operator procedure for ad-hoc, read-mostly access to the Geeves MySQL databases on Cloud SQL.
Written 2026-08-07 after the TiDB → Cloud SQL cutover. Supersedes the stale "VM public IP" note in `gcp-deploy.md`.

## Architecture

- **Instance:** `geeves-495802:us-east4:geeves-primary` (Cloud SQL, MySQL)
- **Beta database:** credentials in Secret Manager as `geeves-beta-database-url` (full `mysql://user:pass@host/db` URI)
- **Live database:** `geeves-live-database-url`
- App connects via the Cloud SQL socket from Cloud Run — never via public IP.

## Golden Rules

1. **Never print secret values.** Pull them from Secret Manager at runtime, decode into env vars or in-process variables. Structural checks only (length, charset, percent-encoding) — never echo the password.
2. **Percent-encoding:** passwords containing a literal `%` must be `%25`-encoded in the URI. Node's `decodeURIComponent` throws `URIError: URI malformed` on bare `%` (this exact bug took beta down on 2026-08-06). Python's `urlparse` tolerates it, so a secret can "look fine" in Python and still break the app. Validate with:

   ```bash
   gcloud secrets versions access latest --secret=SECRET_NAME | python3 -c "
   import sys, re
   v = sys.stdin.read()
   bad = list(re.finditer(r'%(?![0-9A-Fa-f]{2})', v))
   print(f'unencoded % count: {len(bad)}')"
   ```

3. **Secret edits need a revision push on Cloud Run:** `:latest` secrets resolve only at instance start. Force a new revision with a no-op env var:
   `gcloud run services update geeves-beta --region=us-central1 --update-env-vars=CONFIG_STAMP=$(date +%s)`
   **Live is the exception — never force revisions on live; let secret fixes ride with the next normal deploy.**
4. **Beta is for testing, live is read-only** from ad-hoc sessions unless a runbook step explicitly says otherwise.
5. Work on the repo via branch + PR, never direct commits to `main`.

## Setup (fresh Cloud Shell session)

Cloud Shell sessions are ephemeral: env vars and background processes do not survive restarts. Run everything in one session (or one paste).

```bash
# 1. Auth (mobile-friendly: prints a URL, paste the code back)
gcloud auth login --no-browser
gcloud config set project geeves-495802

# 2. Install the Cloud SQL Auth Proxy (persists in $HOME, but cheap to redo)
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# 3. Start the tunnel (background)
./cloud-sql-proxy geeves-495802:us-east4:geeves-primary --port 3307 &
# wait for: "The proxy has started successfully and is ready for new connections!"

# 4. Verify the instance connection name if step 3 errors:
gcloud sql instances list --project=geeves-495802
```

## Query Pattern (pymysql over the tunnel)

Requires `pip install pymysql` if missing. Credentials are pulled at runtime and never printed.

```bash
gcloud secrets versions access latest --secret=geeves-beta-database-url --project=geeves-495802 | python3 -c "
import sys, urllib.parse, pymysql
u = urllib.parse.urlparse(sys.stdin.read().strip())
conn = pymysql.connect(host='127.0.0.1', port=3307, user=u.username,
                       password=urllib.parse.unquote(u.password),
                       database=u.path.lstrip('/').split('?')[0])
cur = conn.cursor()
cur.execute('SELECT 1')
print(cur.fetchall())
conn.close()
"
```

For the **live** database, swap `--secret=geeves-live-database-url`. The same proxy tunnel serves both; only the credentials/dbname differ.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `You do not currently have an active account selected` | Fresh session, no gcloud auth | `gcloud auth login --no-browser` |
| `TypeError: argument of type 'NoneType' is not iterable` (urlparse) | Empty stdin from a failed gcloud call | Fix the gcloud error above it first |
| `./cloud-sql-proxy: No such file or directory` | Binary lost to session reset | Re-run install step |
| `pymysql ... Can't connect to MySQL server on '127.0.0.1'` | Proxy not running | Start tunnel, wait for ready line |
| App logs `URIError: URI malformed at decodeURIComponent` | Bare `%` in DB password in secret | Percent-encode, new secret version, force new revision (beta only) |
| Cloud Run 404 on service URL | Stale hardcoded URL — URLs contain the project-number hash | Always resolve fresh: `gcloud run services describe geeves-beta --region=us-central1 --format='value(status.url)'` |

## Schema Conventions (from GLOBAL_DESIGN.md §4)

- MySQL/TiDB via Drizzle ORM; `nanoid()` string IDs
- Timestamps: UTC milliseconds (bigint) or MySQL datetime — check the column before writing `WHERE` clauses (`FROM_UNIXTIME(col/1000)` for ms-bigint)
- The Unified General Ledger (`journal_entries` / `journal_lines` / `transfer_pairs` / `tax_documents` / `tax_line_items`) is the financial system of record; the `expenses` table is the ingestion/categorization layer
