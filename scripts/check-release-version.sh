#!/usr/bin/env bash
# check-release-version.sh — verify every contract crate shares the release version.
#
# The release process (scripts/release.sh, docs/release-process.md) bumps the
# package version in every contracts/*/Cargo.toml together and promotes the
# CHANGELOG.md [Unreleased] section to a new [X.Y.Z] heading. This check fails
# when any contract crate's version differs from the stated release version,
# so a mismatch is caught before a release tag is published.
#
# Usage:
#   bash scripts/check-release-version.sh [--root <dir>] [<version>]
#
#   <version>      Expected release version without a leading "v" (a leading
#                  "v" is stripped, so a tag name such as v0.2.0 also works).
#                  Default: the newest released "## [X.Y.Z]" heading in
#                  CHANGELOG.md ([Unreleased] is ignored).
#   --root <dir>   Repository root to inspect (default: the repository that
#                  contains this script). Used by the fixture tests.
#
# Exit codes:
#   0 — every contracts/*/Cargo.toml package version equals the release version
#   1 — one or more contract crates have a different or missing version
#   2 — usage or setup error (no contracts, no version source, bad arguments)
#
# Requirements: bash, awk, grep. No network access or Rust toolchain needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXPECTED=""

usage() {
  echo "Usage: bash scripts/check-release-version.sh [--root <dir>] [<version>]" >&2
  exit 2
}

die() { echo "ERROR: $*" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      [ "$#" -ge 2 ] || usage
      ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "ERROR: unknown option: $1" >&2
      usage
      ;;
    *)
      [ -z "$EXPECTED" ] || usage
      EXPECTED="$1"
      shift
      ;;
  esac
done

[ -d "$ROOT" ] || die "Repository root '$ROOT' does not exist"

# ── Resolve the expected release version ──────────────────────────────────────

SOURCE=""
if [ -n "$EXPECTED" ]; then
  EXPECTED="${EXPECTED#v}"
  SOURCE="command-line argument"
else
  CHANGELOG="$ROOT/CHANGELOG.md"
  [ -f "$CHANGELOG" ] || die "No version given and $CHANGELOG not found"
  EXPECTED="$(awk '
    /^## \[[0-9]+\.[0-9]+\.[0-9]+[^]]*\]/ {
      sub(/^## \[/, ""); sub(/\].*$/, ""); print; exit
    }' "$CHANGELOG")"
  [ -n "$EXPECTED" ] || die "No released '## [X.Y.Z]' heading found in $CHANGELOG"
  SOURCE="CHANGELOG.md"
fi

if ! printf '%s\n' "$EXPECTED" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$'; then
  die "Release version '$EXPECTED' is not a valid semver string (expected X.Y.Z or X.Y.Z-label)"
fi

# ── Compare every contract crate ──────────────────────────────────────────────

# Print the `version = "..."` value from the [package] table only, so
# dependency versions and other tables are never mistaken for the crate version.
package_version() {
  awk '
    /^[[:space:]]*\[/ { in_pkg = ($0 ~ /^[[:space:]]*\[package\][[:space:]]*$/); next }
    in_pkg && /^[[:space:]]*version[[:space:]]*=[[:space:]]*"/ {
      line = $0
      sub(/^[^"]*"/, "", line); sub(/".*$/, "", line)
      print line; exit
    }' "$1"
}

echo "Expected release version: $EXPECTED (from $SOURCE)"

CHECKED=0
FAILED=0
for manifest in "$ROOT"/contracts/*/Cargo.toml; do
  [ -f "$manifest" ] || continue
  CHECKED=$((CHECKED + 1))
  rel="${manifest#"$ROOT"/}"
  actual="$(package_version "$manifest")"
  if [ -z "$actual" ]; then
    echo "  FAIL  $rel: no literal [package] version found"
    FAILED=$((FAILED + 1))
  elif [ "$actual" != "$EXPECTED" ]; then
    echo "  FAIL  $rel: version $actual (expected $EXPECTED)"
    FAILED=$((FAILED + 1))
  else
    echo "  ok    $rel: version $actual"
  fi
done

[ "$CHECKED" -gt 0 ] || die "No contracts/*/Cargo.toml manifests found under $ROOT"

if [ "$FAILED" -gt 0 ]; then
  echo "" >&2
  echo "ERROR: $FAILED of $CHECKED contract crate(s) do not match release version $EXPECTED." >&2
  echo "Run 'bash scripts/release.sh $EXPECTED' or update the version field in each" >&2
  echo "contracts/*/Cargo.toml (and CHANGELOG.md) before tagging the release." >&2
  exit 1
fi

echo "All $CHECKED contract crates match release version $EXPECTED."
