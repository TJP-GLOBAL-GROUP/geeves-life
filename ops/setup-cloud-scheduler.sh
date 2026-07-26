#!/usr/bin/env bash
# ============================================================================
# setup-cloud-scheduler.sh
#
# Creates all Google Cloud Scheduler jobs for the geeves-beta Cloud Run service.
# Each job calls a /api/scheduled/* endpoint with x-cron-secret authentication.
#
# Prerequisites:
#   - gcloud CLI authenticated as a user/SA with Cloud Scheduler Admin role
#   - Cloud Run service geeves-beta must be deployed and healthy
#   - SYSTEM_CRON_SECRET must be set in GCP Secret Manager as geeves-cron-secret
#
# Usage (run in GCP Cloud Shell or any machine with gcloud):
#   chmod +x ops/setup-cloud-scheduler.sh
#   ./ops/setup-cloud-scheduler.sh
#
# To verify jobs after creation:
#   gcloud scheduler jobs list --project=geeves-495802 --location=us-central1
# ============================================================================

set -euo pipefail

PROJECT="geeves-495802"
REGION="us-central1"
SERVICE="geeves-beta"
SERVICE_ACCOUNT="geeves-beta-runtime@${PROJECT}.iam.gserviceaccount.com"

# Fetch the Cloud Run service URL
echo "Fetching Cloud Run service URL..."
SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --format="value(status.url)" 2>/dev/null) || {
  echo "ERROR: Could not fetch service URL. Is the service deployed?"
  exit 1
}
echo "Service URL: ${SERVICE_URL}"

# Fetch the SYSTEM_CRON_SECRET from Secret Manager
echo "Fetching SYSTEM_CRON_SECRET from Secret Manager..."
CRON_SECRET=$(gcloud secrets versions access latest \
  --secret="geeves-cron-secret" \
  --project="${PROJECT}" 2>/dev/null) || {
  echo "ERROR: Could not fetch geeves-cron-secret from Secret Manager."
  exit 1
}
echo "SYSTEM_CRON_SECRET fetched (${#CRON_SECRET} chars)"

# Helper: create or update a Cloud Scheduler job
create_or_update_job() {
  local JOB_NAME="$1"
  local SCHEDULE="$2"
  local ENDPOINT="$3"
  local DESCRIPTION="$4"
  local TIMEZONE="${5:-UTC}"

  local URL="${SERVICE_URL}${ENDPOINT}"
  local HEADERS="Content-Type:application/json,x-cron-secret:${CRON_SECRET}"

  echo ""
  echo "→ ${JOB_NAME} (${SCHEDULE})"

  # Check if job already exists
  if gcloud scheduler jobs describe "${JOB_NAME}" \
      --project="${PROJECT}" \
      --location="${REGION}" &>/dev/null; then
    echo "  Updating existing job..."
    gcloud scheduler jobs update http "${JOB_NAME}" \
      --project="${PROJECT}" \
      --location="${REGION}" \
      --schedule="${SCHEDULE}" \
      --uri="${URL}" \
      --http-method=POST \
      --headers="${HEADERS}" \
      --message-body='{}' \
      --time-zone="${TIMEZONE}" \
      --description="${DESCRIPTION}" \
      --oidc-service-account-email="${SERVICE_ACCOUNT}" \
      --oidc-token-audience="${SERVICE_URL}" \
      --attempt-deadline=540s \
      --quiet
  else
    echo "  Creating new job..."
    gcloud scheduler jobs create http "${JOB_NAME}" \
      --project="${PROJECT}" \
      --location="${REGION}" \
      --schedule="${SCHEDULE}" \
      --uri="${URL}" \
      --http-method=POST \
      --headers="${HEADERS}" \
      --message-body='{}' \
      --time-zone="${TIMEZONE}" \
      --description="${DESCRIPTION}" \
      --oidc-service-account-email="${SERVICE_ACCOUNT}" \
      --oidc-token-audience="${SERVICE_URL}" \
      --attempt-deadline=540s \
      --quiet
  fi
  echo "  ✓ Done"
}

echo ""
echo "============================================================"
echo "Creating/updating Cloud Scheduler jobs for ${SERVICE}"
echo "============================================================"

# ── High-frequency jobs (every 2 minutes) ────────────────────────────────────
create_or_update_job \
  "geeves-propagation-retry" \
  "*/2 * * * *" \
  "/api/scheduled/propagation-retry" \
  "Drain propagation_queue: retry failed shadow block propagations"

create_or_update_job \
  "geeves-shadow-block-sync-retry" \
  "*/2 * * * *" \
  "/api/scheduled/shadow-block-sync-retry" \
  "Retry pending/failed shadow block Google Calendar writes"

# ── Every 5 minutes ──────────────────────────────────────────────────────────
create_or_update_job \
  "geeves-guardian-monitor" \
  "*/5 * * * *" \
  "/api/scheduled/guardian-monitor" \
  "Guardian: check GR-3/4/5 guardrails and escalate critical issues"

# ── Every 10 minutes ─────────────────────────────────────────────────────────
create_or_update_job \
  "geeves-ical-poll" \
  "*/10 * * * *" \
  "/api/scheduled/ical-poll" \
  "Poll all active iCal platform feeds and upsert bookings"

# ── Every 30 minutes ─────────────────────────────────────────────────────────
create_or_update_job \
  "geeves-guardian-financial" \
  "*/30 * * * *" \
  "/api/scheduled/guardian-financial" \
  "Guardian: auto-reconcile recent bookings and flag GR-5 anomalies"

# ── Every 45 minutes ─────────────────────────────────────────────────────────
create_or_update_job \
  "geeves-token-refresh" \
  "*/45 * * * *" \
  "/api/scheduled/token-refresh" \
  "Proactively refresh Google OAuth tokens expiring within 30 minutes"

# ── Every 6 hours ────────────────────────────────────────────────────────────
create_or_update_job \
  "geeves-email-scrape" \
  "0 */6 * * *" \
  "/api/scheduled/email-scrape" \
  "Scrape booking confirmation emails from Gmail for all active platforms"

create_or_update_job \
  "geeves-integration-health" \
  "0 */6 * * *" \
  "/api/scheduled/integration-health" \
  "Smoke-test all OAuth token scopes and alert on mismatches"

# ── Every 6 hours (offset by 3h to avoid collision with email-scrape) ────────
create_or_update_job \
  "geeves-orphan-sweep" \
  "0 3,9,15,21 * * *" \
  "/api/scheduled/orphan-sweep" \
  "Delete orphan rows (events/shadow_blocks with no parent calendar)"

# ── Daily at 06:00 UTC ───────────────────────────────────────────────────────
create_or_update_job \
  "geeves-exchange-rate-fetch" \
  "0 6 * * *" \
  "/api/scheduled/exchange-rate-fetch" \
  "Fetch daily exchange rates (USD/JMD) and backfill any gaps"

create_or_update_job \
  "geeves-knowledge-review" \
  "0 6 * * *" \
  "/api/scheduled/knowledge-review" \
  "24h knowledge base review: stamp lastReviewedAt and regenerate AI_MEMORY.md"

# ── Daily at 08:00 America/New_York ─────────────────────────────────────────
create_or_update_job \
  "geeves-guardian-digest" \
  "0 8 * * *" \
  "/api/scheduled/guardian-digest" \
  "Guardian: send daily email digest of all guardrail activity" \
  "America/New_York"

# ── Weekly on Monday at 07:00 America/New_York ───────────────────────────────
create_or_update_job \
  "geeves-weekly-report" \
  "0 7 * * 1" \
  "/api/admin/system-reports/weekly" \
  "Weekly governance report delivered via Resend to tarik@tjperkinsfam.com" \
  "America/New_York"

echo ""
echo "============================================================"
echo "All Cloud Scheduler jobs created/updated successfully."
echo ""
echo "To list all jobs:"
echo "  gcloud scheduler jobs list --project=${PROJECT} --location=${REGION}"
echo ""
echo "To run a job immediately (for testing):"
echo "  gcloud scheduler jobs run geeves-ical-poll --project=${PROJECT} --location=${REGION}"
echo "============================================================"
