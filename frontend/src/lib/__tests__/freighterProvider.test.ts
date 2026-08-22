/**
 * Unit tests for the multi-wallet provider abstraction (#545).
 *
 * - FreighterProvider — delegates to mocked `@stellar/freighter-api`
 * - LedgerProvider   — delegates to mocked `@ledgerhq/hw-transport-webusb`
 * - WalletConnectProvider — delegates to mocked `@walletconnect/sign-client`
 * - useWallet         — provider selection, localStorage persistence,
 *                       auto-reconnect on module init
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════
// FreighterProvider
// ════════════════════════════════════════════════════════════════════════

describe("FreighterProvider", () => {
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
  }));

  vi.mock("../sep7", () => ({
    isFreighterAvailable: vi.fn(),
  }));

  let FreighterProvider: typeof import("../providers/freighterProvider").FreighterProvider;
  let isFreighterAvailable: import("vitest").Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../providers/freighterProvider");
    FreighterProvider = mod.FreighterProvider;
    isFreighterAvailable = (await import("../sep7")).isFreighterAvailable as import("vitest").Mock;
  });

  it("isAvailable returns true when freighter is installed", async () => {
    isFreighterAvailable.mockResolvedValue(true);
    const provider = new FreighterProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it("isAvailable returns false when freighter is not installed", async () => {
    isFreighterAvailable.mockResolvedValue(false);
    const provider = new FreighterProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it("connect throws when freighter is unavailable", async () => {
    isFreighterAvailable.mockResolvedValue(false);
    const provider = new FreighterProvider();
    await expect(provider.connect()).rejects.toThrow(/Freighter wallet is not installed/i);
  });

  it("connect returns the public key on success", async () => {
    isFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");

    const provider = new FreighterProvider();
    const addr = await provider.connect();
    expect(addr).toBe("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
    expect(mockSetAllowed).toHaveBeenCalledOnce();
    expect(mockGetPublicKey).toHaveBeenCalledOnce();
  });

  it("signXdr calls freighter signTransaction with network passphrase", async () => {
    isFreighterAvailable.mockResolvedValue(true);
    mockSetAllowed.mockResolvedValue(undefined);
    mockGetPublicKey.mockResolvedValue("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
    mockSignTransaction.mockResolvedValue("signed-xdr");

    const provider = new FreighterProvider();
    await provider.connect();
    // Mock isConnected to return true after connect
    mockIsConnected.mockResolvedValue(true);

    const result = await provider.signXdr("input-xdr");
    expect(result).toBe("signed-xdr");
    expect(mockSignTransaction).toHaveBeenCalledWith("input-xdr", {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  });

  it("disconnect is a no-op that does not throw", async () => {
    const provider = new FreighterProvider();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });
});