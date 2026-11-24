/**
 * SDK contract health-check example (#1133).
 *
 * Run with: `npx tsx docs/examples/sdk_health_check_example.ts`
 * (set VITE_KYC_REGISTRY_ID, and optionally VITE_COMPLIANCE_ENGINE_ID /
 * VITE_RWA_TOKEN_ID — see README.md)
 *
 * Read-only: no wallet, secret key, signing, or funded account is needed.
 * Every call either reads ledger/event data from the RPC node or simulates a
 * contract read.
 *
 * A health result is a SNAPSHOT taken at `checkedAt`. It tells you what the
 * RPC node and contract looked like at that moment. It does not guarantee that
 * a transaction submitted later will succeed: the node can go down, the
 * compliance engine can be paused, or the network can congest after the
 * check. Re-check on an interval and always handle write failures on their
 * own.
 *
 * For a fuller operational dashboard built on the same idea, see the frontend
 * status page: frontend/src/pages/StatusPage.tsx (served at `/status`).
 */

import {
  checkHealth,
  createClients,
  createServer,
  MALFORMED_RPC_RESPONSE_PREFIX,
  type ContractHealth,
} from "@veritoken/sdk";

// ── 1. Per-client health via createClients ──────────────────────────────────
//
// Each configured client exposes `health(opts?)`. Clients whose contract ID is
// not set are simply absent, so use optional chaining.

const clients = createClients({
  network: "testnet",
  contractIds: {
    kycRegistry: process.env.VITE_KYC_REGISTRY_ID,
    complianceEngine: process.env.VITE_COMPLIANCE_ENGINE_ID,
    rwaToken: process.env.VITE_RWA_TOKEN_ID,
  },
});

type Status = "operational" | "degraded" | "unavailable";

/**
 * Turn a health snapshot into a status label for a status page.
 *
 * `extensions` are the per-contract reads (`verifierCount`, `paused`, ...).
 * They are `null` when that individual read failed even though the RPC node
 * itself answered, which is a degraded, not a down, contract.
 */
function interpret(h: ContractHealth, extensions: unknown[] = []): Status {
  if (!h.reachable) return "unavailable";
  if (extensions.some((v) => v === null)) return "degraded";
  return "operational";
}

function describeFailure(h: ContractHealth): string {
  if (h.error?.startsWith(MALFORMED_RPC_RESPONSE_PREFIX)) {
    // The node answered, but with a payload the SDK could not trust.
    return `RPC returned an unexpected payload: ${h.error}`;
  }
  return `RPC unreachable: ${h.error ?? "unknown error"}`;
}

async function clientHealth() {
  // Smaller lookback window = fewer events to scan. Default is 1000 ledgers.
  const opts = { lookbackLedgers: 500 };

  const kyc = await clients.kycRegistry?.health(opts);
  if (kyc) {
    const status = interpret(kyc, [kyc.verifierCount]);
    console.log(`kyc-registry: ${status} (as of ${kyc.checkedAt})`);
    if (status === "unavailable") console.log(`  ${describeFailure(kyc)}`);
    // Per-contract extension: null means that read failed, not "zero".
    console.log(`  verifiers: ${kyc.verifierCount ?? "unknown"}`);
    console.log(`  events in last ${opts.lookbackLedgers} ledgers: ${kyc.recentEventCount}`);
  }

  const ce = await clients.complianceEngine?.health(opts);
  if (ce) {
    console.log(
      `compliance-engine: ${interpret(ce, [ce.paused, ce.holderCount])} (as of ${ce.checkedAt})`,
    );
    // `paused: true` means the RPC is fine but transfers are currently halted.
    if (ce.paused) console.log("  transfers are PAUSED by the compliance engine");
    console.log(`  holders: ${ce.holderCount ?? "unknown"}`);
  }

  const token = await clients.rwaToken?.health(opts);
  if (token) {
    console.log(`rwa-token: ${interpret(token, [token.totalSupply])} (as of ${token.checkedAt})`);
    console.log(`  total supply: ${token.totalSupply ?? "unknown"}`);
  }
}

// ── 2. Base health for any contract via checkHealth ─────────────────────────
//
// `checkHealth(server, contractId, opts?)` takes an `rpc.Server` and a raw
// contract ID. Use it for contracts that have no dedicated client, or in
// monitoring scripts that already hold a server instance.

async function baseHealth(contractId: string) {
  const server = createServer("testnet");
  const h = await checkHealth(server, contractId, { lookbackLedgers: 500 });
  console.log(`${contractId}: ${interpret(h)} at ledger ${h.latestLedger ?? "n/a"}`);
  if (!h.reachable) console.log(`  ${describeFailure(h)}`);
}

async function main() {
  await clientHealth();
  const kycId = process.env.VITE_KYC_REGISTRY_ID;
  if (kycId) await baseHealth(kycId);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
