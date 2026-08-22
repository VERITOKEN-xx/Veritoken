/**
 * Tests for the multi-provider `useWallet` store (#545):
 * - provider switching via `selectProvider`
 * - localStorage persistence of the chosen provider
 * - auto-reconnect on module init when a provider was previously stored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockIsConnected = vi.hoisted(() => vi.fn());
const mockGetPublicKey = vi.hoisted(() => vi.fn());
const mockSignTransaction = vi.hoisted(() => vi.fn());
const mockSetAllowed = vi.hoisted(() => vi.fn());
const mockIsFreighterAvailable = vi.hoisted(() => vi.fn());

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

vi.mock("../sep7", () => ({
  isFreighterAvailable: mockIsFreighterAvailable,
  isMobile: () => false,
  buildSep7Uri: vi.fn(),
  generateQrDataUrl: vi.fn(),
  openSep7Link: vi.fn(),
}));

const localStorageMock = vi.hoisted(() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
});

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// The wallet store is module-level and runs `attemptAutoReconnect()` at
// import time, which checks localStorage. We import it lazily per test so
// each test controls the persisted state before the module loads.
let useWallet: typeof import("../wallet").useWallet;

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  mockIsConnected.mockResolvedValue(false);
});

afterEach(() => {
  vi.resetModules();
});

describe("useWallet provider state", () => {
  it("defaults to freighter when nothing is persisted", async () => {
    useWallet = (await import("../wallet")).useWallet;
    const state = useWallet.getState();
    expect(state.providerType).toBe("freighter");
    expect(state.providerTypeList).toEqual(["freighter", "ledger", "walletconnect"]);
    expect(state.connected).toBe(false);
    expect(state.address).toBeNull();
  });

  it("loads the persisted provider type from localStorage", async () => {
    localStorageMock.setItem("veritoken-wallet-provider", "ledger");
    useWallet = (await import("../wallet")).useWallet;
    expect(useWallet.getState().providerType).toBe("ledger");
  });
});

describe("useWallet.selectProvider", () => {
  it("persists the new provider type to localStorage", async () => {
    useWallet = (await import("../wallet")).useWallet;
    await useWallet.getState().selectProvider("ledger");

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "veritoken-wallet-provider",
      "ledger",
    );
    expect(useWallet.getState().providerType).toBe("ledger");
  });

  it("disconnects before switching when already connected", async () => {
    // Force a connected state via freighter connect path.
    mockIsFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");

    useWallet = (await import("../wallet")).useWallet;
    await useWallet.getState().connect();
    expect(useWallet.getState().connected).toBe(true);

    // Switch to ledger — the connection must be torn down so the previous
    // session is not left dangling.
    await useWallet.getState().selectProvider("ledger");

    expect(useWallet.getState().providerType).toBe("ledger");
    expect(useWallet.getState().connected).toBe(false);
    expect(useWallet.getState().address).toBeNull();
  });
});

describe("useWallet connect with provider", () => {
  it("connects via freighter through the provider abstraction", async () => {
    mockIsFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");

    useWallet = (await import("../wallet")).useWallet;
    await useWallet.getState().connect();

    const state = useWallet.getState();
    expect(state.connected).toBe(true);
    expect(state.address).toBe("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
    expect(state.providerType).toBe("freighter");
  });

  it("signTx throws when not connected", async () => {
    useWallet = (await import("../wallet")).useWallet;
    await expect(useWallet.getState().signTx("xdr")).rejects.toThrow(
      /Wallet not connected/i,
    );
  });

  it("signTx calls the current provider's signXdr", async () => {
    mockIsFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
    mockSignTransaction.mockResolvedValue("signed-xdr");

    useWallet = (await import("../wallet")).useWallet;
    await useWallet.getState().connect();

    const result = await useWallet.getState().signTx("input-xdr");
    expect(result).toBe("signed-xdr");
    expect(mockSignTransaction).toHaveBeenCalledWith("input-xdr", {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });
});

describe("useWallet auto-reconnect", () => {
  it("reconnects automatically when a supported provider was persisted", async () => {
    // Persist freighter BEFORE loading the module so the init hook can find it.
    localStorageMock.setItem("veritoken-wallet-provider", "freighter");
    mockIsFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");

    useWallet = (await import("../wallet")).useWallet;

    // attemptAutoReconnect runs at import; flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const state = useWallet.getState();
    expect(state.connected).toBe(true);
    expect(state.address).toBe("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
  });

  it("stays disconnected when the persisted provider is unavailable", async () => {
    localStorageMock.setItem("veritoken-wallet-provider", "ledger");
    mockIsFreighterAvailable.mockResolvedValue(false);

    useWallet = (await import("../wallet")).useWallet;

    await new Promise((r) => setTimeout(r, 0));

    expect(useWallet.getState().connected).toBe(false);
    expect(useWallet.getState().address).toBeNull();
  });
});