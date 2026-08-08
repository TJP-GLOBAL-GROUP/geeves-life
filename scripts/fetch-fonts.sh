#!/usr/bin/env bash
# ============================================================================
# fetch-fonts.sh — self-host the Geeves.Life brand fonts (finance v2.2).
#
# Downloads the exact woff2 files referenced by client/src/styles/fonts.css
# from Google Fonts (css2 API -> fonts.gstatic.com) into
# client/public/fonts/. All fonts are SIL Open Font License 1.1
# (Outfit, Inter, JetBrains Mono) — self-hosting is permitted.
#
# Usage:  bash scripts/fetch-fonts.sh
# Requires: curl, grep, sed (GNU or BSD).
# ============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/client/public/fonts"
mkdir -p "${OUT_DIR}"

# A browser User-Agent is required so the css2 API returns woff2 URLs.
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# family|weights|basename  — one line per font family.
FAMILIES=(
  "Outfit|300;700|outfit"
  "Inter|400;500;600|inter"
  "JetBrains Mono|400;500|jetbrains-mono"
)

fetch_family() {
  local family="$1" weights="$2" base="$3"
  local family_q="${family// /+}"
  local css_url="https://fonts.googleapis.com/css2?family=${family_q}:wght@${weights}&display=swap"
  local css
  css="$(curl -fsSL -A "${UA}" "${css_url}")"

  # Each @font-face block contains one weight and one woff2 URL.
  # Extract (weight, url) pairs and download.
  printf '%s' "${css}" | tr '}' '\n' | while IFS= read -r block; do
    case "${block}" in *font-face*) ;; *) continue ;; esac
    local weight url out
    weight="$(printf '%s' "${block}" | sed -n 's/.*font-weight:[[:space:]]*\([0-9]*\).*/\1/p' | head -n1)"
    url="$(printf '%s' "${block}" | sed -n 's/.*url(\([^)]*\.woff2\)).*/\1/p' | head -n1)"
    if [[ -z "${weight}" || -z "${url}" ]]; then
      echo "WARN: could not parse a @font-face block for ${family}" >&2
      continue
    fi
    out="${OUT_DIR}/${base}-${weight}.woff2"
    echo "Fetching ${family} ${weight} -> ${out}"
    curl -fsSL -A "${UA}" "${url}" -o "${out}"
  done
}

for entry in "${FAMILIES[@]}"; do
  IFS='|' read -r family weights base <<< "${entry}"
  fetch_family "${family}" "${weights}" "${base}"
done

echo "Done. Fonts written to ${OUT_DIR}"
echo "Expected files:"
echo "  outfit-300.woff2 outfit-700.woff2"
echo "  inter-400.woff2 inter-500.woff2 inter-600.woff2"
echo "  jetbrains-mono-400.woff2 jetbrains-mono-500.woff2"
