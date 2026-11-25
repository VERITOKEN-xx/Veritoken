/**
 * SDK health and analytics helpers (#400).
 *
 * `checkHealth` gathers basic operational signals for a deployed contract
 * without requiring a wallet or write access. All reads are simulated
 * (read-only) and safe to call from monitoring scripts or dashboards.
 *
 * Signals collected:
 * - `reachable`         — RPC responded without a network error and with a
 *                         well-formed payload (see "Malformed responses")
 * - `paused`            — compliance engine pause state (where applicable)
 * - `latestLedger`      — current ledger sequence from the RPC node
 * - `recentEventCount`  — number of contract events in the last `lookbackLedgers` ledgers
 * - `checkedAt`         — ISO timestamp of the check
 *
 * Per-contract extensions (e.g. `holderCount`, `verifierCount`) are added
 * by the individual client `health()` methods.
 *
 * Malformed responses (#984): a successful HTTP response is not proof of a
 * healthy Soroban endpoint. If `getLatestLedger` returns no usable integer
 * `sequence`, or `getEvents` returns no `events` array, the check reports
 * `reachable: false` with an `error` starting with
 * {@link MALFORMED_RPC_RESPONSE_PREFIX} so callers can tell a bad payload
 * apart from a network failure without any change to `ContractHealth`.
 */

import type { rpc } from "@stellar/stellar-sdk";

export interface ContractHealth {
  /** True when the RPC node responded without a network-level error. */
  reachable: boolean;
  /** Current ledger sequence at the time of the check. null when unreachable. */
  latestLedger: number | null;
  /** Number of contract events emitted in the lookback window. */
  recentEventCount: number;
  /** ISO 8601 timestamp of when this snapshot was taken. */
  checkedAt: string;
  /** Any error message captured during the check. */
  error?: string;
}

/** Prefix of `ContractHealth.error` when the RPC returned an unusable payload. */
export const MALFORMED_RPC_RESPONSE_PREFIX = "Malformed RPC response";

function malformed(detail: string): Error {
  return new Error(`${MALFORMED_RPC_RESPONSE_PREFIX}: ${detail}`);
}

export interface HealthCheckOptions {
  /** How many ledgers back to scan for recent events. @default 1000 */
  lookbackLedgers?: number;
}

/**
 * Collect base health signals for any contract.
 * Called internally by each client's `health()` method.
 */
export async function checkHealth(
  server: rpc.Server,
  contractId: string,
  opts: HealthCheckOptions = {},
): Promise<ContractHealth> {
  const lookback = opts.lookbackLedgers ?? 1_000;
  const checkedAt = new Date().toISOString();

  let latestLedger: number | null = null;
  let recentEventCount = 0;
  let error: string | undefined;

  try {
    const ledgerInfo: unknown = await server.getLatestLedger();
    const sequence = (ledgerInfo as { sequence?: unknown } | null | undefined)?.sequence;
    if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) {
      throw malformed("getLatestLedger returned no valid `sequence`");
    }
    latestLedger = sequence;

    const startLedger = Math.max(0, latestLedger - lookback);
    const eventsResp: unknown = await server.getEvents({
      filters: [{ type: "contract", contractIds: [contractId] }],
      startLedger,
    });
    const events = (eventsResp as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(events)) {
      throw malformed("getEvents returned no `events` array");
    }
    recentEventCount = events.length;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return { reachable: false, latestLedger: null, recentEventCount: 0, checkedAt, error };
  }

  return { reachable: true, latestLedger, recentEventCount, checkedAt, ...(error ? { error } : {}) };
}
