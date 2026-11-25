#!/usr/bin/env bash
# Fixture tests for scripts/check-release-version.sh.
#
# Builds throwaway repositories in a temporary directory, runs the check
# against each, and asserts on its exit code and output. Needs no network
# access or Rust toolchain.
#
# Usage:
#   bash scripts/tests/check-release-version.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/../check-release-version.sh"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

PASSED=0
FAILED=0

# make_fixture <dir> <changelog-version> <crate>=<version>...
make_fixture() {
  local dir="$1" changelog_version="$2"
  shift 2
  mkdir -p "$dir/contracts"
  cat > "$dir/CHANGELOG.md" <<EOF
# Changelog

## [Unreleased]

## [${changelog_version}] — 2026-01-01

### Added
- Fixture entry.
EOF
  local spec crate version
  for spec in "$@"; do
    crate="${spec%%=*}"
    version="${spec#*=}"
    mkdir -p "$dir/contracts/$crate"
    cat > "$dir/contracts/$crate/Cargo.toml" <<EOF
[package]
name = "$crate"
version = "$version"
edition = "2021"

[dependencies]
soroban-sdk = { version = "22.0.0" }
EOF
  done
}

# expect <name> <expected-exit> <expected-output-substring> -- <args...>
expect() {
  local name="$1" want_code="$2" want_text="$3"
  shift 4
  local output code=0
  output="$(bash "$CHECK" "$@" 2>&1)" || code=$?
  if [ "$code" -eq "$want_code" ] && printf '%s' "$output" | grep -qF -- "$want_text"; then
    echo "ok    $name"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $name (exit $code, wanted $want_code; output must contain '$want_text')"
    printf '%s\n' "$output" | sed 's/^/        /'
    FAILED=$((FAILED + 1))
  fi
}

make_fixture "$TMP_ROOT/matching" 0.3.0 alpha=0.3.0 beta=0.3.0
expect "matching versions pass against CHANGELOG.md" 0 \
  "All 2 contract crates match release version 0.3.0" -- --root "$TMP_ROOT/matching"
expect "matching versions pass against an explicit tag" 0 \
  "from command-line argument" -- --root "$TMP_ROOT/matching" v0.3.0
expect "explicit version that differs from the crates fails" 1 \
  "version 0.3.0 (expected 0.4.0)" -- --root "$TMP_ROOT/matching" 0.4.0

make_fixture "$TMP_ROOT/mismatched" 0.3.0 alpha=0.3.0 beta=0.2.9
expect "one mismatched crate fails and is named" 1 \
  "contracts/beta/Cargo.toml: version 0.2.9 (expected 0.3.0)" -- --root "$TMP_ROOT/mismatched"

make_fixture "$TMP_ROOT/no-release" 0.3.0 alpha=0.3.0
printf '# Changelog\n\n## [Unreleased]\n' > "$TMP_ROOT/no-release/CHANGELOG.md"
expect "missing released CHANGELOG heading is a setup error" 2 \
  "No released '## [X.Y.Z]' heading" -- --root "$TMP_ROOT/no-release"

expect "invalid version string is rejected" 2 \
  "not a valid semver string" -- --root "$TMP_ROOT/matching" 0.3

echo ""
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
