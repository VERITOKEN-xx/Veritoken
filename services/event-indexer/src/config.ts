/**
 * Load and validate indexer configuration from environment variables.
 *
 * Required env vars:
 *   DATABASE_URL  or  PGHOST + PGDATABASE + PGUSER + PGPASSWORD
 *   RPC_URL          — Soroban RPC endpoint
 *
 * Optional:
 *   NETWORK_PASSPHRASE  — defaults to testnet
 *   POLL_INTERVAL_MS    — defaults to 5000
 *   PORT                — HTTP port, defaults to 3001
 *   CONTRACT_IDS        — comma-separated list of "label:contractId" pairs
 *                         e.g. "rwa:C…,kyc:C…"
 */

import type { IndexerConfig, ContractConfig } from "./types.js";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

function parseContracts(raw: string): ContractConfig[] {
  if (!raw.trim()) return [];
  const contracts = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const colonIdx = entry.indexOf(":");
      if (colonIdx === -1) {
        return { label: entry, contractId: entry };
      }
      return {
        label:      entry.slice(0, colonIdx).trim(),
        contractId: entry.slice(colonIdx + 1).trim(),
      };
    })
    .filter((c) => c.contractId.length > 0);

  // Fix 3: reject blank labels
  for (const c of contracts) {
    if (c.label.length === 0) {
      throw new Error(
        `CONTRACT_IDS contains an entry with a blank label (contractId: "${c.contractId}")`
      );
    }
  }

  // Reject whitespace left inside a label or contract ID after trimming, so a
  // malformed identifier (e.g. "rwa:CABC DEF") is never stored in the config.
  for (const c of contracts) {
    if (/\s/.test(c.label) || /\s/.test(c.contractId)) {
      throw new Error(
        `CONTRACT_IDS contains whitespace inside an entry (label: "${c.label}", contractId: "${c.contractId}")`
      );
    }
  }

  // Fix 4: reject duplicate labels and duplicate contract IDs
  const seenLabels     = new Set<string>();
  const seenContractIds = new Set<string>();
  for (const c of contracts) {
    if (seenLabels.has(c.label)) {
      throw new Error(`CONTRACT_IDS contains a duplicate label: "${c.label}"`);
    }
    seenLabels.add(c.label);

    if (seenContractIds.has(c.contractId)) {
      throw new Error(`CONTRACT_IDS contains a duplicate contract ID: "${c.contractId}"`);
    }
    seenContractIds.add(c.contractId);
  }

  return contracts;
}

export function loadConfig(): IndexerConfig {
  // Fix 2: trim the RPC URL and reject a value that is blank after trimming
  const rawRpcUrl = process.env.RPC_URL ?? process.env.STELLAR_RPC_URL;
  const rpcUrl    = rawRpcUrl?.trim() ?? "";
  if (!rpcUrl) {
    throw new Error(
      "RPC_URL environment variable is required " +
        "(checked RPC_URL, STELLAR_RPC_URL; both are unset or blank)"
    );
  }

  const rawPassphrase = process.env.NETWORK_PASSPHRASE ?? process.env.STELLAR_NETWORK_PASSPHRASE;
  let networkPassphrase: string;
  if (rawPassphrase) {
    networkPassphrase = rawPassphrase;
  } else {
    const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
    networkPassphrase = network === "mainnet" ? MAINNET_PASSPHRASE : TESTNET_PASSPHRASE;
  }

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
  if (isNaN(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error("POLL_INTERVAL_MS must be a positive integer");
  }

  // Fix 1: validate PORT is within the legal TCP range 1–65535
  const port = parseInt(process.env.PORT ?? "3001", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const contracts = parseContracts(process.env.CONTRACT_IDS ?? "");

  return { rpcUrl, networkPassphrase, pollIntervalMs, contracts, port };
}
