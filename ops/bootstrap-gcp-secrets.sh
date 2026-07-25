#!/usr/bin/env bash
# ── Geeves.Life Beta — GCP Secret Manager bootstrap ──────────────────────────
# Run ONCE to create all secrets in Secret Manager.
# Usage: PROJECT_ID=your-project-id bash ops/bootstrap-gcp-secrets.sh
# Prerequisites: gcloud CLI authenticated with owner/editor role
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID env var}"
REGION="us-central1"
SERVICE="geeves-beta"
RUNTIME_SA="${SERVICE}-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Creating secrets in project: $PROJECT_ID ==="

create_secret() {
  local name="$1"
  local prompt="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "  [skip] $name already exists"
  else
    echo -n "  Enter value for $name ($prompt): "
    read -rs value
    echo
    printf '%s' "$value" | gcloud secrets create "$name" \
      --data-file=- --project="$PROJECT_ID" --replication-policy=automatic
    echo "  [ok] $name created"
  fi
  # Grant runtime SA access
  gcloud secrets add-iam-policy-binding "$name" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor --quiet
}

# ── Required secrets ──────────────────────────────────────────────────────────
create_secret "geeves-beta-database-url"   "mysql://geeves_app:PASSWORD@35.245.41.148:3306/geeves_beta"
create_secret "geeves-jwt-secret"          "random 32-byte base64 string (run: openssl rand -base64 32)"
create_secret "geeves-cron-secret"         "random string to guard /api/scheduled/* endpoints"
create_secret "geeves-edit-secret"         "shared with Reconciliation Explorer Live DB setting"
create_secret "geeves-resend-api-key"      "re_xxxx from resend.com"
create_secret "geeves-google-client-id"    "Google OAuth client ID (console.cloud.google.com)"
create_secret "geeves-google-client-secret" "Google OAuth client secret"
create_secret "geeves-gcs-credentials"    "full JSON content of GCS service account key file"

echo ""
echo "=== All secrets created and runtime SA granted access ==="
echo ""
echo "Next: set GitHub repo secrets/variables:"
echo "  gh variable set GCP_PROJECT_ID -R TJP-GLOBAL-GROUP/geeves-life -b\"$PROJECT_ID\""
echo "  gh secret set GCP_WIF_PROVIDER  -R TJP-GLOBAL-GROUP/geeves-life"
echo "  gh secret set GCP_DEPLOY_SA     -R TJP-GLOBAL-GROUP/geeves-life"
echo ""
echo "Then push to main to trigger the first deploy."
