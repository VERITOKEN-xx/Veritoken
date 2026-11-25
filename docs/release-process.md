# Release Process

This document describes how Veritoken releases are prepared, automated, and published.

---

## Overview

Releases are driven by the maintainer running `scripts/release.sh`. The script handles version bumping, changelog formatting, and git tagging. Pushing the tag triggers the release CI workflow, which builds WASM artifacts and creates a GitHub release automatically.

```
maintainer runs scripts/release.sh
        │
        ▼
version bump in contracts/*/Cargo.toml
changelog entry promoted from [Unreleased] → [X.Y.Z]
release commit created
git tag vX.Y.Z applied
        │
        ▼ (after manual push)
GitHub Actions release.yml triggers on the tag
        │
        ├── build WASM artifacts
        ├── optimise binaries with stellar contract optimize
        ├── extract changelog entry for the release body
        └── create GitHub release with WASM files attached
```

---

## Versioning Policy

Veritoken uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Version numbers apply to the contract suite as a whole.

| Change type | Bump |
|---|---|
| Breaking change to a public contract function | **Major** (`0.1.0` → `1.0.0`) |
| New public function added to any contract | **Minor** (`0.1.0` → `0.2.0`) |
| Bug fix with no ABI change | **Patch** (`0.1.0` → `0.1.1`) |
| Pre-release / release candidate | Suffix (`0.2.0-rc.1`) |

Breaking changes (major bumps) must be discussed in an issue before implementation.

---

## Release Branches and Triggers

- All releases are tagged from `main`.
- The CI release workflow triggers on any tag matching `v*.*.*` or `v*.*.*-*`.
- There are no long-lived release branches. Hot-fixes are cherry-picked to `main` and re-tagged.

---

## Step-by-Step: Preparing a Release

### 1. Ensure the `[Unreleased]` section is populated

Open `CHANGELOG.md` and confirm the `[Unreleased]` section contains entries for all changes since the last release. The script will error if it is empty.

### 2. Confirm the working tree is clean and tests pass

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --features testutils
bash scripts/check-release-version.sh
```

`scripts/check-release-version.sh` confirms that every `contracts/*/Cargo.toml`
package version equals the newest released `## [X.Y.Z]` heading in
`CHANGELOG.md`. Pass a version (`bash scripts/check-release-version.sh 0.2.0`)
to check against that value instead. It exits `1` and names each crate whose
version differs. The same check runs in the `release-version` CI job, inside
`scripts/release.sh` after the version bump, and as the first step of
`release.yml`, where it checks against the pushed tag before anything is
built or published.

### 3. Run the release script

```bash
bash scripts/release.sh <version>
# Example:
bash scripts/release.sh 0.2.0
```

The script:
1. Validates the version string (must be `X.Y.Z` or `X.Y.Z-label`).
2. Checks that the working tree is clean and the tag does not already exist.
3. Bumps the `version` field in every `contracts/*/Cargo.toml`.
4. Regenerates `Cargo.lock` to capture the new versions.
5. Promotes the `[Unreleased]` section in `CHANGELOG.md` to `[X.Y.Z] — YYYY-MM-DD`.
6. Creates a release commit: `chore: release vX.Y.Z`.
7. Tags the commit `vX.Y.Z`.

### 4. Review the result

```bash
git show HEAD          # review the commit
cat CHANGELOG.md       # review the changelog entry
git tag --list | grep v0  # confirm the tag exists
```

### 5. Push

```bash
git push origin main
git push origin vX.Y.Z
```

The tag push triggers the `release.yml` CI workflow. Monitor it in the Actions tab.

### 6. Verify the GitHub release

Once CI completes, the GitHub release page for `vX.Y.Z` will be created with:
- The changelog entry as the release body
- Optimised WASM binaries for all five contracts as downloadable artifacts

---

## Verifying Deployment Artifacts Before Release

Run these commands from the repository root, in this order. The **Needs**
column lists what each step depends on. Steps 1–3 check **local build output** only.
Steps 4–6 check a **deployment manifest**, so they apply only once a
deployment exists (for example, the testnet deployment you are promoting).

| # | Command | What it checks | Needs |
|---|---|---|---|
| 1 | `cargo build --release --target wasm32v1-none` | Builds the release WASM into `target/wasm32v1-none/release/` | Rust toolchain |
| 2 | `bash scripts/verify-artifacts.sh` | Local build output: every required artifact exists, has the WASM magic bytes, and is 4 KB–128 KB | Step 1 output |
| 3 | `bash scripts/check-wasm-size.sh` | Local build output: each contract is within its [size budget](contract-size-budget.md) | Step 1 output |
| 4 | `python3 scripts/deployment_cli.py validate-manifest --manifest deploy-manifest.json` | Deployment manifest: offline structural check (schema, network, contract records). Does not read artifacts or contact the network | `deploy-manifest.json` from a deployment |
| 5 | `bash scripts/verify-deployment.sh <identity>` | Deployment manifest against local artifacts **and on-chain state**: local SHA-256 and metadata hashes, deployed code hash, deployed metadata, registry links, health calls. Writes `deployment-verification-report.json` | Step 1 output, `deploy-manifest.json`, Stellar CLI, network access |
| 6 | `bash scripts/check-drift.sh --check-only` | Deployment manifest against `frontend/.env` contract IDs and network. Offline | `deploy-manifest.json`, `frontend/.env` |

Step 5 hashes the artifact files at the paths recorded in the manifest, so run
it against the same build that was deployed. Optimising or rebuilding those
files changes their hashes, and the check fails.

Steps 1–4 and 6 never contact the network. Passing them does **not** show
what is deployed on-chain and is not a substitute for step 5. Hand over
contract IDs only after step 5 reports `status: passed` with zero failed
checks.

Manifests written by the TypeScript deployer in `deployment/scripts/` use a
different format. Check those with `verify-manifest.ts`, as described in
[deployment/scripts/README.md](../deployment/scripts/README.md).

For what each check covers, the report format, and the identity and network
options, see [docs/deployment-automation.md](deployment-automation.md). For
the mainnet promotion checklist, see
[docs/mainnet-deployment.md](mainnet-deployment.md).

---

## Reverting a Release (before push)

If you need to undo the release commit and tag before pushing:

```bash
git tag -d vX.Y.Z
git reset --hard HEAD~1
```

This is safe as long as the tag has not been pushed to the remote.

---

## Changelog Format

Follow the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. Use the standard subsections:

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- Changed behaviour description

### Fixed
- Bug fix description

### Removed
- Removed feature description
```

The release script promotes the entire `[Unreleased]` block to the new version section. Keep entries concise and developer-facing.

---

## What Gets Released

Every GitHub release includes:

| Artifact | Description |
|---|---|
| `kyc_registry-X.Y.Z.wasm` | Optimised KYC Registry WASM |
| `compliance_engine-X.Y.Z.wasm` | Optimised Compliance Engine WASM |
| `invoice_token-X.Y.Z.wasm` | Optimised Invoice Token WASM |
| `property_token-X.Y.Z.wasm` | Optimised Property Token WASM |
| `carbon_credit_token-X.Y.Z.wasm` | Optimised Carbon Credit Token WASM |

Frontend source is not packaged separately — use the repository tag directly.

---

## Pre-releases

For release candidates, append a suffix:

```bash
bash scripts/release.sh 0.2.0-rc.1
```

Tags matching `v*.*.*-*` are automatically marked as pre-releases in the GitHub release.

---

## CI Workflow Reference

The release workflow lives at `.github/workflows/release.yml`. It:

1. Checks out the repository at the tagged commit.
2. Runs `scripts/check-release-version.sh` against the tag and stops if any
   contract crate version differs.
3. Installs the Rust toolchain and Stellar CLI.
4. Builds and optimises all WASM binaries.
5. Extracts the changelog entry for the tagged version.
6. Creates the GitHub release using `softprops/action-gh-release`.

No secrets beyond the default `GITHUB_TOKEN` are required — the `contents: write` permission is granted in the workflow file.
