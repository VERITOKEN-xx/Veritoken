/**
 * Tests for the wallet adapter abstraction (issue #382)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for @stellar/freighter-api (dynamic import path)
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

import {
  FreighterAdapter,
  FallbackAdapter,
  selectAdapter,
} from "../walletAdapter";

const TEST_PASSPHRASE = "Test SDF Network ; September 2015";
const TEST_ADDRESS = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// FreighterAdapter
// ---------------------------------------------------------------------------

describe("FreighterAdapter", () => {
  const adapter = new FreighterAdapter();

  it('has name "Freighter"', () => {
    expect(adapter.name).toBe("Freighter");
  });

  describe("isAvailable", () => {
    it("returns true when Freighter is connected", async () => {
      mockIsConnected.mockResolvedValue(true);
      expect(await adapter.isAvailable()).toBe(true);
    });

    it("returns false when Freighter is not connected", async () => {
      mockIsConnected.mockResolvedValue(false);
      expect(await adapter.isAvailable()).toBe(false);
    });
  });

  describe("connect", () => {
    it("resolves to the public key on success", async () => {
      mockIsConnected.mockResolvedValue(true);
      mockSetAllowed.mockResolvedValue(undefined);
      mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);

      const key = await adapter.connect();
      expect(key).toBe(TEST_ADDRESS);
    });

    it("throws when Freighter is not installed", async () => {
      mockIsConnected.mockResolvedValue(false);
      await expect(adapter.connect()).rejects.toThrow(/not installed/i);
    });

    it("throws when getPublicKey returns empty string", async () => {
      mockIsConnected.mockResolvedValue(true);
      mockSetAllowed.mockResolvedValue(undefined);
      mockGetPublicKey.mockResolvedValue("");

      await expect(adapter.connect()).rejects.toThrow(/public key/i);
    });
  });

  describe("signTransaction", () => {
    it("returns the signed XDR from Freighter", async () => {
      mockSignTransaction.mockResolvedValue("signed-xdr");
      const result = await adapter.signTransaction("raw-xdr", TEST_PASSPHRASE);
      expect(result).toBe("signed-xdr");
      expect(mockSignTransaction).toHaveBeenCalledWith("raw-xdr", {
        networkPassphrase: TEST_PASSPHRASE,
      });
    });

    it("throws when Freighter returns empty result", async () => {
      mockSignTransaction.mockResolvedValue("");
      await expect(
        adapter.signTransaction("raw-xdr", TEST_PASSPHRASE),
      ).rejects.toThrow(/empty signed transaction/i);
    });
  });
});

// ---------------------------------------------------------------------------
// FallbackAdapter (#382 fallback path)
// ---------------------------------------------------------------------------

describe("FallbackAdapter (issue #382 fallback)", () => {
  const adapter = new FallbackAdapter();

  it('has name "No wallet"', () => {
    expect(adapter.name).toBe("No wallet");
  });

  it("isAvailable always returns true", async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("connect throws with install guidance", async () => {
    await expect(adapter.connect()).rejects.toThrow(/no wallet extension/i);
  });

  it("signTransaction always throws", async () => {
    await expect(
      adapter.signTransaction("xdr", TEST_PASSPHRASE),
    ).rejects.toThrow(/unavailable/i);
  });
});

// ---------------------------------------------------------------------------
// selectAdapter (#382 — adapter selection)
// ---------------------------------------------------------------------------

describe("selectAdapter (issue #382)", () => {
  it("returns FreighterAdapter when Freighter is available", async () => {
    mockIsConnected.mockResolvedValue(true);
    const adapter = await selectAdapter();
    expect(adapter.name).toBe("Freighter");
  });

  it("returns FallbackAdapter when Freighter is not available", async () => {
    mockIsConnected.mockResolvedValue(false);
    const adapter = await selectAdapter();
    expect(adapter.name).toBe("No wallet");
  });
});
