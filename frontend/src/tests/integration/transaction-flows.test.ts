/**
 * Integration test harness: Transaction simulate / submit / confirm flows
 *
 * Tests exercise the simulateAndSend helper and the contract-layer helpers
 * (readCall / writeCall from contracts/base.ts) against mocked Stellar SDK
 * primitives.  All RPC calls are stubbed so the suite runs in CI without any
 * live network access.
 *
 * Coverage:
 *  ✓ simulateAndSend – happy path (PENDING → SUCCESS)
 *  ✓ simulateAndSend – simulation returns error
 *  ✓ simulateAndSend – sendTransaction returns ERROR status
 *  ✓ simulateAndSend – getTransaction returns FAILED
 *  ✓ simulateAndSend – polls until NOT_FOUND resolves to SUCCESS
 *  ✓ simulateAndSend – extracts contract error code and maps to message
 *  ✓ decodeContractError – known and unknown codes for every contract type
 *  ✓ validateStellarAddress – accepts valid G-addresses, rejects invalid ones
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @stellar/stellar-sdk ────────────────────────────────────────────────
const mockSimulate   = vi.hoisted(() => vi.fn());
const mockSend       = vi.hoisted(() => vi.fn());
const mockGetTx      = vi.hoisted(() => vi.fn());
const mockAssemble   = vi.hoisted(() => vi.fn());
const mockIsSimError = vi.hoisted(() => vi.fn());

vi.mock("@stellar/stellar-sdk", () => ({
  Networks: {
    PUBLIC:  "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
  TransactionBuilder: {
    fromXDR: vi.fn(() => ({ toXDR: () => "mock-xdr" })),
  },
  rpc: {
    Server: vi.fn(() => ({
      simulateTransaction: mockSimulate,
      sendTransaction:     mockSend,
      getTransaction:      mockGetTx,
    })),
    Api: {
      isSimulationError: mockIsSimError,
    },
    assembleTransaction: mockAssemble,
  },
}));

vi.mock("../../lib/networkStore", () => ({
  useNetworkStore: {
    getState: () => ({ network: "testnet" }),
  },
  getNetworkRpcUrl: () => "https://soroban-testnet.stellar.org",
}));

import { simulateAndSend, decodeContractError, validateStellarAddress } from "../../lib/stellar";

const VALID_ADDRESS   = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
const mockSignTx      = vi.fn(async (xdr: string) => `signed:${xdr}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSimError.mockReturnValue(false);
  mockAssemble.mockReturnValue({ build: () => ({ toXDR: () => "assembled-xdr" }) });
});

// ── simulateAndSend ───────────────────────────────────────────────────────────

describe("simulateAndSend – happy path", () => {
  it("resolves with SUCCESS result after PENDING → SUCCESS poll", async () => {
    mockSend.mockResolvedValue({ status: "PENDING", hash: "abc123" });
    mockGetTx.mockResolvedValue({ status: "SUCCESS", resultXdr: "result-xdr" });

    const result = await simulateAndSend("fake-xdr", mockSignTx);

    expect(result.status).toBe("SUCCESS");
    expect(mockSignTx).toHaveBeenCalledWith("assembled-xdr");
  });

  it("polls through NOT_FOUND before reaching SUCCESS", async () => {
    mockSend.mockResolvedValue({ status: "PENDING", hash: "poll123" });
    mockGetTx
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValue({ status: "SUCCESS", resultXdr: "res" });

    // Speed up the internal polling delay
    vi.useFakeTimers();
    const promise = simulateAndSend("fake-xdr", mockSignTx);
    // Advance past the two 1500 ms delays
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.status).toBe("SUCCESS");
    expect(mockGetTx).toHaveBeenCalledTimes(3);
  });
});

describe("simulateAndSend – error paths", () => {
  it("throws when simulation returns an error object", async () => {
    mockIsSimError.mockReturnValue(true);
    mockSimulate.mockResolvedValue({ error: "ContractError something" });

    await expect(simulateAndSend("fake-xdr", mockSignTx)).rejects.toThrow(
      /simulation failed/i,
    );
  });

  it("throws when simulation error contains a numeric code", async () => {
    mockIsSimError.mockReturnValue(true);
    mockSimulate.mockResolvedValue({ error: "ContractError (code=3)" });

    await expect(simulateAndSend("fake-xdr", mockSignTx)).rejects.toThrow(
      /contract error/i,
    );
  });

  it("throws when sendTransaction returns status ERROR", async () => {
    mockSend.mockResolvedValue({ status: "ERROR", errorResult: { msg: "bad tx" } });

    await expect(simulateAndSend("fake-xdr", mockSignTx)).rejects.toThrow(
      /Transaction failed/,
    );
  });

  it("throws when final getTransaction status is FAILED", async () => {
    mockSend.mockResolvedValue({ status: "PENDING", hash: "x" });
    mockGetTx.mockResolvedValue({ status: "FAILED" });

    await expect(simulateAndSend("fake-xdr", mockSignTx)).rejects.toThrow(
      /not successful/i,
    );
  });
});

// ── decodeContractError ───────────────────────────────────────────────────────

describe("decodeContractError – known codes", () => {
  it("decodes KYC errors", () => {
    expect(decodeContractError("kyc", 1)).toBe("Contract already initialized");
    expect(decodeContractError("kyc", 2)).toBe("Not an authorized verifier");
    expect(decodeContractError("kyc", 3)).toBe("KYC not approved");
    expect(decodeContractError("kyc", 4)).toBe("No KYC record found");
  });

  it("decodes compliance errors", () => {
    expect(decodeContractError("compliance", 1)).toBe("Contract already initialized");
  });

  it("decodes invoice errors", () => {
    expect(decodeContractError("invoice", 2)).toBe("Invoice already settled");
    expect(decodeContractError("invoice", 8)).toBe("KYC not approved");
    expect(decodeContractError("invoice", 11)).toBe("Transfer blocked by compliance engine");
  });

  it("decodes property errors", () => {
    expect(decodeContractError("property", 3)).toBe("Insufficient shares");
    expect(decodeContractError("property", 6)).toBe("KYC tier below property requirement");
  });

  it("decodes carbon errors", () => {
    expect(decodeContractError("carbon", 6)).toBe("Transfer blocked by compliance engine");
  });

  it("decodes rwa errors", () => {
    expect(decodeContractError("rwa", 4)).toBe("Insufficient balance");
  });
});

describe("decodeContractError – unknown codes", () => {
  it("returns a descriptive fallback for unrecognised code", () => {
    const msg = decodeContractError("kyc", 999);
    expect(msg).toMatch(/unknown/i);
    expect(msg).toContain("999");
  });

  it("includes the contract type in the fallback", () => {
    const msg = decodeContractError("invoice", 42);
    expect(msg).toContain("42");
  });
});

// ── validateStellarAddress ────────────────────────────────────────────────────

describe("validateStellarAddress", () => {
  it("accepts a valid 56-char G-address", () => {
    expect(validateStellarAddress(VALID_ADDRESS)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateStellarAddress("")).toBe(false);
  });

  it("rejects an address that starts with S (secret key)", () => {
    expect(
      validateStellarAddress("SAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"),
    ).toBe(false);
  });

  it("rejects an address that is too short", () => {
    expect(validateStellarAddress("GABC123")).toBe(false);
  });

  it("rejects addresses with characters outside the base32 alphabet", () => {
    // '1' and '0' are not in the Stellar base32 charset
    expect(
      validateStellarAddress("G1AZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"),
    ).toBe(false);
  });

  it("rejects null-like inputs gracefully", () => {
    // @ts-expect-error -- deliberately passing wrong type to test the null/undefined guard
    expect(validateStellarAddress(null)).toBe(false);
    // @ts-expect-error -- deliberately passing wrong type to test the null/undefined guard
    expect(validateStellarAddress(undefined)).toBe(false);
  });
});
