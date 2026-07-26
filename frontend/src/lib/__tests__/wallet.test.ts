import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIsConnected = vi.hoisted(() => vi.fn());
const mockGetPublicKey = vi.hoisted(() => vi.fn());
const mockSignTransaction = vi.hoisted(() => vi.fn());
const mockSetAllowed = vi.hoisted(() => vi.fn());

vi.mock("@stellar/freighter-api", () => ({
  isConnected: mockIsConnected,
  getPublicKey: mockGetPublicKey,
  signTransaction: mockSignTransaction,
  setAllowed: mockSetAllowed,
}));

vi.mock("../stellar", () => ({
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  getNetwork: () => "testnet",
  getRpcUrl: () => "https://soroban-testnet.stellar.org",
  getNetworkPassphrase: () => "Test SDF Network ; September 2015",
  server: {},
  CONTRACT_IDS: {},
  validateStellarAddress: (addr: string) => /^G[A-Z2-7]{55}$/.test(addr),
}));

import { useWallet } from "../wallet";

const TEST_ADDRESS = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR";

beforeEach(() => {
  useWallet.setState({
    address: null,
    connected: false,
    connectionError: null,
    loading: false,
    adapterName: null,
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("useWallet initial state", () => {
  it("starts disconnected with no address", () => {
    const { address, connected } = useWallet.getState();
    expect(address).toBeNull();
    expect(connected).toBe(false);
  });

  it("starts with no connection error", () => {
    expect(useWallet.getState().connectionError).toBeNull();
  });

  it("starts with loading false", () => {
    expect(useWallet.getState().loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// connect — success
// ---------------------------------------------------------------------------

describe("useWallet.connect — success", () => {
  it("sets address and connected=true on success", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);

    await useWallet.getState().connect();

    const { address, connected, connectionError } = useWallet.getState();
    expect(connected).toBe(true);
    expect(address).toBe(TEST_ADDRESS);
    expect(connectionError).toBeNull();
  });

  it("clears loading flag after successful connect", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);

    await useWallet.getState().connect();

    expect(useWallet.getState().loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// connect — failure (#381 resilience)
// ---------------------------------------------------------------------------

describe("useWallet.connect — failure (issue #381)", () => {
  it("sets connectionError when Freighter is not installed", async () => {
    mockIsConnected.mockResolvedValue(false);

    await useWallet.getState().connect();

    const { connected, connectionError } = useWallet.getState();
    expect(connected).toBe(false);
    expect(connectionError).toMatch(/not installed/i);
  });

  it("does not throw — error is captured in state", async () => {
    mockIsConnected.mockResolvedValue(false);

    // Should not throw
    await expect(useWallet.getState().connect()).resolves.toBeUndefined();
  });

  it("sets connectionError when getPublicKey rejects", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockRejectedValue(new Error("User rejected"));

    await useWallet.getState().connect();

    expect(useWallet.getState().connectionError).toMatch(/user rejected/i);
    expect(useWallet.getState().connected).toBe(false);
  });

  it("clears loading flag on failure", async () => {
    mockIsConnected.mockResolvedValue(false);
    await useWallet.getState().connect();
    expect(useWallet.getState().loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearError (#381)
// ---------------------------------------------------------------------------

describe("useWallet.clearError (issue #381)", () => {
  it("clears the connectionError field", async () => {
    mockIsConnected.mockResolvedValue(false);
    await useWallet.getState().connect();
    expect(useWallet.getState().connectionError).not.toBeNull();

    useWallet.getState().clearError();
    expect(useWallet.getState().connectionError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe("useWallet.disconnect", () => {
  it("clears address and sets connected=false", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);
    await useWallet.getState().connect();
    expect(useWallet.getState().connected).toBe(true);

    useWallet.getState().disconnect();
    expect(useWallet.getState().address).toBeNull();
    expect(useWallet.getState().connected).toBe(false);
  });

  it("clears connectionError on disconnect", async () => {
    useWallet.setState({ connectionError: "Some error" });
    useWallet.getState().disconnect();
    expect(useWallet.getState().connectionError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// signTx (#382 — adapter-backed signing)
// ---------------------------------------------------------------------------

describe("useWallet.signTx (issue #382)", () => {
  it("throws with friendly message if wallet not connected", async () => {
    await expect(useWallet.getState().signTx("some-xdr")).rejects.toThrow(
      /wallet not connected/i,
    );
  });

  it("calls adapter signTransaction and returns signed XDR", async () => {
    useWallet.setState({ address: TEST_ADDRESS, connected: true });
    mockIsConnected.mockResolvedValue(true);
    mockSignTransaction.mockResolvedValue("signed-xdr-result");

    const result = await useWallet.getState().signTx("input-xdr");
    expect(result).toBe("signed-xdr-result");
    expect(mockSignTransaction).toHaveBeenCalledWith("input-xdr", {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });

  it("wraps signing errors with a friendly message", async () => {
    useWallet.setState({ address: TEST_ADDRESS, connected: true });
    mockIsConnected.mockResolvedValue(true);
    mockSignTransaction.mockRejectedValue(new Error("Ledger timeout"));

    await expect(useWallet.getState().signTx("input-xdr")).rejects.toThrow(
      /Transaction signing failed/i,
    );
  });
});
