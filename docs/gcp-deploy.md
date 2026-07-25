# Geeves.Life Beta → Google Cloud: Secrets, Buckets, Cloud Run
One-time setup. Replace `PROJECT_ID` with your GCP project id. All secrets live in
**Secret Manager**; GitHub holds only non-secret identifiers (WIF provider + SA email).

## 0. Naming

| Thing | Value |
|---|---|
| Cloud Run service | `geeves-beta` (region `us-central1`) |
| Deploy SA | `geeves-deploy@PROJECT_ID.iam.gserviceaccount.com` (GitHub Actions) |
| Runtime SA | `geeves-beta-runtime@PROJECT_ID.iam.gserviceaccount.com` (Cloud Run + GCS + Secret Manager) |
| Buckets | `geeves-beta-uploads` · `geeves-beta-backups` · `geeves-beta-exports` |
| Beta DB | MySQL on GCE `35.245.41.148:3306`, db `geeves_beta` |

## 1. Enable APIs

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  storage.googleapis.com iamcredentials.googleapis.com --project PROJECT_ID
```

## 2. Buckets

```bash
for b in uploads backups exports; do
  gcloud storage buckets create gs://geeves-beta-$b --location=us-central1 \
    --uniform-bucket-level-access --project PROJECT_ID
done
# runtime SA can read/write uploads+exports; backups write-only via lifecycle
gcloud storage buckets add-iam-policy-binding gs://geeves-beta-uploads \
  --member="serviceAccount:geeves-beta-runtime@PROJECT_ID.iam.gserviceaccount.com" --role=roles/storage.objectAdmin
# (repeat for exports and backups)
# backups: auto-delete after 30 days
gcloud storage buckets update gs://geeves-beta-backups \
  --lifecycle-file=<(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}')
```

## 3. Database user for the app (on the beta MySQL VM)

```sql
CREATE USER 'geeves_app'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT,INSERT,UPDATE,DELETE ON geeves_beta.* TO 'geeves_app'@'%';
FLUSH PRIVILEGES;
```
Cloud Run egress is dynamic — either allowlist `0.0.0.0/0` on MySQL with a strong
password (pragmatic for beta) or set up a VPC connector + firewall rule (recommended
before live).

## 4. Secret Manager (the actual secrets)

```bash
gen() { head -c 32 /dev/urandom | base64; }   # for generated secrets
printf 'mysql://geeves_app:<db-password>@35.245.41.148:3306/geeves_beta?connectionLimit=20' \
  | gcloud secrets create geeves-beta-database-url --data-file=- --project PROJECT_ID
for s in geeves-edit-secret geeves-cron-secret geeves-jwt-secret; do
  gen | gcloud secrets create $s --data-file=- --project PROJECT_ID
done
printf '<resend-key>' | gcloud secrets create geeves-resend-api-key --data-file=- --project PROJECT_ID

# runtime SA reads secrets at cold start
for s in geeves-beta-database-url geeves-edit-secret geeves-cron-secret geeves-jwt-secret geeves-resend-api-key; do
  gcloud secrets add-iam-policy-binding $s --project PROJECT_ID \
    --member="serviceAccount:geeves-beta-runtime@PROJECT_ID.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```
**Hand the `geeves-edit-secret` value to the Reconciliation Explorer §9 (Live DB)**
so live-writes authenticate against `POST /api/edits`.

## 5. Service accounts + Workload Identity Federation (GitHub → GCP, keyless)

```bash
gcloud iam service-accounts create geeves-deploy --project PROJECT_ID
gcloud iam service-accounts create geeves-beta-runtime --project PROJECT_ID

# deploy SA can build+deploy
for r in roles/run.admin roles/artifactregistry.writer roles/cloudbuild.builds.editor roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:geeves-deploy@PROJECT_ID.iam.gserviceaccount.com" --role=$r
done

gcloud iam workload-identity-pools create github --location=global --project PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --workload-identity-pool=github --location=global --project PROJECT_ID \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repo=assertion.repository" \
  --attribute-condition="assertion.repository=='TJP-GLOBAL-GROUP/geeves-life'"
gcloud iam service-accounts add-iam-policy-binding \
  geeves-deploy@PROJECT_ID.iam.gserviceaccount.com --project PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repo/TJP-GLOBAL-GROUP/geeves-life"
```

## 6. GitHub repo configuration (NOT secrets in .env)

Repo **variable** (Settings → Secrets and variables → Actions → Variables):
- `GCP_PROJECT_ID` = your project id

Repo **secrets** (same page, Secrets tab):
- `GCP_WIF_PROVIDER` = `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions`
- `GCP_DEPLOY_SA` = `geeves-deploy@PROJECT_ID.iam.gserviceaccount.com`

Via CLI: `gh variable set GCP_PROJECT_ID -R TJP-GLOBAL-GROUP/geeves-life -b"…"` / `gh secret set GCP_WIF_PROVIDER -R TJP-GLOBAL-GROUP/geeves-life -b"…"`.

## 7. Deploy

Move `docs/ci/deploy-cloudrun.yml.example` → `.github/workflows/deploy-cloudrun.yml`
(token needs `workflow` scope), push to main. The workflow builds the Docker image,
deploys with `--set-secrets` (env vars injected straight from Secret Manager — nothing
sensitive ever touches GitHub or the image), then smoke-checks `/api/health`.

First manual deploy (before wiring CI) works too:

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/geeves/geeves-beta
gcloud run deploy geeves-beta --image … --region us-central1 \
  --service-account geeves-beta-runtime@… \
  --set-secrets "DATABASE_URL=geeves-beta-database-url:latest,…" \
  --set-env-vars "NODE_ENV=production,GCS_BUCKET_UPLOADS=geeves-beta-uploads,…"
```

## 8. Domain + cron

- Map `beta.geeves.life`: `gcloud run domain-mappings create --service geeves-beta --domain beta.geeves.life --region us-central1`, then add the shown DNS records.
- Cloud Scheduler for the iCal poll: `gcloud scheduler jobs create http ical-poll --schedule="*/10 * * * *" --uri="https://beta.geeves.life/api/scheduled/ical-poll" --http-method=POST --headers="x-cron-secret=<geeves-cron-secret value>"`

## Notes / honest caveats

- The app's upload storage currently runs through the **Forge proxy** (`BUILT_IN_FORGE_API_*`).
  The GCS buckets above are wired for backups/exports today; swapping upload storage to a
  native GCS adapter is a small code change (`server/_core/storageProxy.ts`) — tracked as a
  follow-up, not silently assumed.
- `DATABASE_URL` uses the VM's public IP; restrict MySQL bind/firewall to what's needed.
- Nightly DB backup: add a cron on the VM: `mysqldump geeves_beta | gsutil cp - gs://geeves-beta-backups/daily/$(date +%F).sql`.
