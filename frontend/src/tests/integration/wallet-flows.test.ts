/**
 * Integration test harness: Wallet connect / disconnect / sign flows
 *
 * These tests exercise the full wallet lifecycle at the store level (Zustand +
 * Freighter API) without a browser extension.  The Freighter API module is
 * mocked at the boundary so every path – happy, error, and edge cases – is
 * deterministic and runnable in CI.
 *
 * Coverage:
 *  ✓ Initial disconnected state
 *  ✓ Connect – Freighter not installed
 *  ✓ Connect – successful path (sets address + connected)
 *  ✓ Disconnect – clears state
 *  ✓ signTx – wallet not connected
 *  ✓ signTx – happy path returns signed XDR
 *  ✓ signTx – Freighter API rejects (propagates error)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @stellar/freighter-api ──────────────────────────────────────────────
const mockIsConnected    = vi.hoisted(() => vi.fn());
const mockGetPublicKey   = vi.hoisted(() => vi.fn());
const mockSignTransaction = vi.hoisted(() => vi.fn());
const mockSetAllowed     = vi.hoisted(() => vi.fn());

vi.mock("@stellar/freighter-api", () => ({
  isConnected:    mockIsConnected,
  getPublicKey:   mockGetPublicKey,
  signTransaction: mockSignTransaction,
  setAllowed:     mockSetAllowed,
}));

// ── Mock stellar.ts (avoid full SDK init in tests) ───────────────────────────
vi.mock("../../lib/stellar", () => ({
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  getNetwork: () => "testnet",
  getRpcUrl:  () => "https://soroban-testnet.stellar.org",
  getNetworkPassphrase: () => "Test SDF Network ; September 2015",
  server: {},
  CONTRACT_IDS: {},
  validateStellarAddress: (addr: string) => /^G[A-Z2-7]{54,55}$/.test(addr),
}));

import { useWallet } from "../../lib/wallet";

const VALID_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

beforeEach(() => {
  useWallet.setState({ address: null, connected: false });
  vi.clearAllMocks();
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe("wallet initial state", () => {
  it("starts disconnected with no address", () => {
    const { address, connected } = useWallet.getState();
    expect(address).toBeNull();
    expect(connected).toBe(false);
  });
});

// ── Connect flow ──────────────────────────────────────────────────────────────

describe("wallet connect flow", () => {
  it("throws when Freighter is not installed", async () => {
    mockIsConnected.mockResolvedValue(false);
    await expect(useWallet.getState().connect()).rejects.toThrow(
      /Freighter wallet is not installed/i,
    );
    expect(useWallet.getState().connected).toBe(false);
  });

  it("sets address and connected=true on success", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue(VALID_ADDRESS);

    await useWallet.getState().connect();

    const { address, connected } = useWallet.getState();
    expect(connected).toBe(true);
    expect(address).toBe(VALID_ADDRESS);
  });

  it("does not mutate state when Freighter rejects getPublicKey", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockRejectedValue(new Error("User rejected"));

    await expect(useWallet.getState().connect()).rejects.toThrow("User rejected");
    expect(useWallet.getState().connected).toBe(false);
    expect(useWallet.getState().address).toBeNull();
  });
});

// ── Disconnect flow ───────────────────────────────────────────────────────────

describe("wallet disconnect flow", () => {
  it("clears address and sets connected=false after connect", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue(VALID_ADDRESS);
    await useWallet.getState().connect();

    useWallet.getState().disconnect();

    expect(useWallet.getState().address).toBeNull();
    expect(useWallet.getState().connected).toBe(false);
  });

  it("is idempotent when called while already disconnected", () => {
    expect(() => useWallet.getState().disconnect()).not.toThrow();
    expect(useWallet.getState().connected).toBe(false);
  });
});

// ── Transaction signing flow ──────────────────────────────────────────────────

describe("wallet signTx flow", () => {
  it("throws when wallet is not connected", async () => {
    await expect(useWallet.getState().signTx("some-xdr")).rejects.toThrow(
      /Wallet not connected/i,
    );
  });

  it("calls Freighter signTransaction and returns signed XDR", async () => {
    useWallet.setState({ address: VALID_ADDRESS, connected: true });
    mockSignTransaction.mockResolvedValue("signed-xdr-result");

    const result = await useWallet.getState().signTx("input-xdr");

    expect(result).toBe("signed-xdr-result");
    expect(mockSignTransaction).toHaveBeenCalledWith("input-xdr", {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });

  it("propagates Freighter rejection to the caller", async () => {
    useWallet.setState({ address: VALID_ADDRESS, connected: true });
    mockSignTransaction.mockRejectedValue(new Error("User declined signing"));

    await expect(useWallet.getState().signTx("input-xdr")).rejects.toThrow(
      "User declined signing",
    );
  });

  it("calls signTransaction with the exact XDR string passed in", async () => {
    useWallet.setState({ address: VALID_ADDRESS, connected: true });
    mockSignTransaction.mockResolvedValue("ok");

    const xdr = "AAAAAQAAAAB" + "A".repeat(50);
    await useWallet.getState().signTx(xdr);

    expect(mockSignTransaction).toHaveBeenCalledWith(
      xdr,
      expect.objectContaining({ networkPassphrase: expect.any(String) }),
    );
  });
});
