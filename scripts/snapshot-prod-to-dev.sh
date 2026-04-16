#!/usr/bin/env bash
# Snapshots the production Convex deployment and replaces the local dev
# deployment data with it. Destructive: your local dev data is wiped.
#
# Usage:
#   ./scripts/snapshot-prod-to-dev.sh          # prompts for confirmation
#   ./scripts/snapshot-prod-to-dev.sh --yes    # skip confirmation
#
# Requires: authenticated `npx convex` (run `npx convex dev` once locally).
#
# After import, this script clears Better Auth's `jwks` and `session` tables
# so Better Auth regenerates keys with the LOCAL BETTER_AUTH_SECRET.
# Without this, token decryption fails and ctx.auth.getUserIdentity() returns
# null everywhere, making the app appear empty even though data is present.

set -euo pipefail

SKIP_CONFIRM="false"
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  SKIP_CONFIRM="true"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SNAPSHOT_DIR="$REPO_ROOT/.context/prod-snapshots"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SNAPSHOT_PATH="$SNAPSHOT_DIR/snapshot-$TIMESTAMP.zip"

mkdir -p "$SNAPSHOT_DIR"

echo "════════════════════════════════════════════════════════════"
echo "  Convex prod → dev snapshot"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Snapshot will be saved to:"
echo "    $SNAPSHOT_PATH"
echo ""
echo "  ⚠  This will DELETE all data in your local dev deployment"
echo "     and replace it with a copy of production."
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
  read -r -p "Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

cd "$REPO_ROOT"

echo ""
echo "→ Exporting production (including file storage)..."
npx convex export --prod --include-file-storage --path "$SNAPSHOT_PATH"

echo ""
echo "→ Replacing dev deployment with snapshot..."
npx convex import --replace-all -y "$SNAPSHOT_PATH"

# Better Auth stores its JWKS (JSON Web Key Set) encrypted with BETTER_AUTH_SECRET.
# When we copy prod's JWKS into dev, dev can't decrypt them (different secret),
# so every token exchange fails with "Failed to decrypt private key".
# We clear the jwks table so Better Auth regenerates keys with dev's secret.
# We also clear sessions (signed with prod secret, useless locally).
echo ""
echo "→ Clearing Better Auth jwks + sessions (so dev regenerates keys locally)..."
EMPTY_JSONL="$(mktemp -t convex-empty).jsonl"
: > "$EMPTY_JSONL"
npx convex import --component betterAuth --table jwks --replace -y "$EMPTY_JSONL"
npx convex import --component betterAuth --table session --replace -y "$EMPTY_JSONL"
rm -f "$EMPTY_JSONL"

# Row-level tokenIdentifier fields are prefixed with the prod deployment's
# convex.site URL. The dev deployment has a different URL, so those identifiers
# never match ctx.auth.getUserIdentity() locally and every row appears orphaned.
# Remap the prefix from prod → dev.
echo ""
echo "→ Remapping tokenIdentifier prefixes from prod → dev..."
if [[ ! -f "$REPO_ROOT/.env.local" ]]; then
  echo "  ⚠  .env.local not found. Skipping remap — run it manually later."
else
  # shellcheck disable=SC1091
  DEV_SITE_URL=$(grep -E '^VITE_CONVEX_SITE_URL=' "$REPO_ROOT/.env.local" | head -1 | cut -d= -f2-)
  # Extract prod prefix from any imported row that has a tokenIdentifier
  PROD_PREFIX=$(npx convex data userProfiles --limit 1 2>/dev/null \
    | grep -oE 'https://[^|"]+\|' | head -1)

  if [[ -z "$PROD_PREFIX" ]]; then
    echo "  ⚠  Could not detect prod tokenIdentifier prefix — skipping remap."
  elif [[ -z "$DEV_SITE_URL" ]]; then
    echo "  ⚠  VITE_CONVEX_SITE_URL missing in .env.local — skipping remap."
  else
    DEV_PREFIX="${DEV_SITE_URL}|"
    if [[ "$PROD_PREFIX" == "$DEV_PREFIX" ]]; then
      echo "  (prod and dev prefixes already match — nothing to remap)"
    else
      echo "  $PROD_PREFIX  →  $DEV_PREFIX"
      npx convex run devScripts:remapTokenIdentifiers \
        "{\"fromPrefix\":\"$PROD_PREFIX\",\"toPrefix\":\"$DEV_PREFIX\"}"
    fi
  fi
fi

echo ""
echo "✓ Done. Local dev now mirrors production as of $TIMESTAMP."
echo ""
echo "Next steps:"
echo "  1. Sign out in your browser (clear cookies for localhost)."
echo "  2. Sign in again with your prod credentials — passwords work because"
echo "     the user/account tables were imported intact."
echo "  3. Better Auth will regenerate JWKS on first token request."
