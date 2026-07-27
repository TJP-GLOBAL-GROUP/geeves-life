#!/bin/bash
# One-time LIVE environment provisioning — run in Cloud Shell or any gcloud-authenticated shell.
# Beta is untouched by this script. Replace PROJECT_ID / PROJECT_NUMBER before running.
set -euo pipefail
PROJECT_ID="PROJECT_ID"          # ← your GCP project id
PROJECT_NUMBER="PROJECT_NUMBER"  # ← gcloud projects describe $PROJECT_ID --format='value(projectNumber)'
REGION="us-central1"
gcloud config set project "$PROJECT_ID"

# ── 1. Runtime service account for live ──
gcloud iam service-accounts create geeves-live-runtime --display-name="geeves-live runtime" || true
# deploy SA (already exists from beta setup) gets run.admin etc. — reused for live deploys.

# ── 2. Live buckets ──
for b in uploads backups exports; do
  gcloud storage buckets create "gs://geeves-live-$b" --location="$REGION" --uniform-bucket-level-access || true
  gcloud storage buckets add-iam-policy-binding "gs://geeves-live-$b" \
    --member="serviceAccount:geeves-live-runtime@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/storage.objectAdmin
done
gcloud storage buckets update gs://geeves-live-backups \
  --lifecycle-file=<(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}')

# ── 3. Live database (separate schema on the existing MySQL VM) ──
# Run on the MySQL VM:
cat <<'SQL'
-- mysql -u root -p  (on the beta/live MySQL VM)
CREATE DATABASE IF NOT EXISTS geeves_live CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'geeves_app_live'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT,INSERT,UPDATE,DELETE ON geeves_live.* TO 'geeves_app_live'@'%';
FLUSH PRIVILEGES;
SQL

# ── 4. Live secrets in Secret Manager ──
printf 'mysql://geeves_app_live:<strong-password>@35.245.41.148:3306/geeves_live?connectionLimit=20' \
  | gcloud secrets create geeves-live-database-url --data-file=- || true
gen() { head -c 32 /dev/urandom | base64; }
for s in geeves-live-edit-secret geeves-live-cron-secret geeves-live-jwt-secret; do
  gen | gcloud secrets create "$s" --data-file=- || true
done
printf '<resend-key>' | gcloud secrets create geeves-live-resend-api-key --data-file=- || true
for s in geeves-live-database-url geeves-live-edit-secret geeves-live-cron-secret geeves-live-jwt-secret geeves-live-resend-api-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:geeves-live-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

# ── 5. Domain mappings (DNS records shown after each create — add them at your registrar) ──
gcloud run domain-mappings create --service geeves-live --domain geeves.life --region "$REGION" || true
gcloud run domain-mappings create --service geeves-beta --domain beta.geeves.life --region "$REGION" || true

echo "LIVE provisioning done. First live deploy happens via the 'Promote to LIVE' workflow in GitHub Actions."
