#!/usr/bin/env bash
# ── Geeves.Life Beta — GitHub repo secrets/variables setup ───────────────────
# Run after bootstrap-gcp-secrets.sh once you have WIF provider + deploy SA.
# Usage: PROJECT_ID=your-gcp-project-id PROJECT_NUMBER=your-project-number bash ops/setup-github-repo.sh
# Prerequisites: gh CLI authenticated with repo + workflow scope
set -euo pipefail

REPO="TJP-GLOBAL-GROUP/geeves-life"
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID env var}"
PROJECT_NUMBER="${PROJECT_NUMBER:?Set PROJECT_NUMBER env var}"
DEPLOY_SA="geeves-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-actions"

echo "=== Setting GitHub Actions variables for $REPO ==="
gh variable set GCP_PROJECT_ID -R "$REPO" -b"$PROJECT_ID"
echo "  [ok] GCP_PROJECT_ID=$PROJECT_ID"

echo "=== Setting GitHub Actions secrets for $REPO ==="
gh secret set GCP_WIF_PROVIDER -R "$REPO" -b"$WIF_PROVIDER"
echo "  [ok] GCP_WIF_PROVIDER set"
gh secret set GCP_DEPLOY_SA -R "$REPO" -b"$DEPLOY_SA"
echo "  [ok] GCP_DEPLOY_SA set"

echo ""
echo "=== Done. Push to main or run workflow_dispatch to deploy. ==="

