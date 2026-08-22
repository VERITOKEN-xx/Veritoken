/**
 * Unit tests for LedgerProvider (#545).
 *
 * All hardware interaction happens through `@ledgerhq/hw-transport-webusb`
 * and `@ledgerhq/hw-app-str`, both of which are mocked here so the tests
 * run headless and deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — must be defined before the module is imported.
const mockCreate = vi.hoisted(() => vi.fn());
const mockIsSupported = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());
const mockOn = vi.hoisted(() => vi.fn());
const mockGetPublicKey = vi.hoisted(() => vi.fn());
const mockSignTransaction = vi.hoisted(() => vi.fn());

vi.mock("@ledgerhq/hw-transport-webusb", () => ({
  default: {
    create: mockCreate,
    isSupported: mockIsSupported,
  },
}));

vi.mock("@ledgerhq/hw-app-str", () => ({
  default: class StellarAppMock {
    getPublicKey = mockGetPublicKey;
    signTransaction = mockSignTransaction;
  },
}));

vi.mock("../stellar", () => ({
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
}));

vi.mock("@stellar/stellar-sdk", () => {
  // Minimal Transaction stub that lets the provider parse an XDR string,
  // produce a signature base, add a signature, and re-serialize.
  class TransactionStub {
    private _xdr: string;
    constructor(xdr: string) {
      this._xdr = xdr;
    }
    signatureBase() {
      return Buffer.from("signature-base-bytes");
    }
    addSignature() {
      // no-op
    }
    toXDR() {
      return this._xdr + "-signed";
    }
  }
  return {
    StrKey: {
      encodeEd25519PublicKey: (raw: Buffer) => `G-${raw.toString("hex").slice(0, 8)}`,
    },
    Transaction: TransactionStub,
  };
});

import { LedgerProvider, LedgerUserCancelledError } from "../providers/ledgerProvider";

// A valid-looking 32-byte raw public key.
const RAW_PK = Buffer.alloc(32, 1);
const EXPECTED_ADDRESS = `G-${RAW_PK.toString("hex").slice(0, 8)}`;

// Mock transport instance shared across tests.
const mockTransport = {
  close: mockClose,
  on: mockOn,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupported.mockResolvedValue(true);
  mockCreate.mockResolvedValue(mockTransport);
  mockGetPublicKey.mockResolvedValue({ rawPublicKey: RAW_PK });
  mockSignTransaction.mockResolvedValue({ signature: Buffer.from("sig-bytes") });
});

describe("LedgerProvider.isAvailable", () => {
  it("returns false when WebUSB is not supported", async () => {
    mockIsSupported.mockResolvedValue(false);
    await expect(new LedgerProvider().isAvailable()).resolves.toBe(false);
  });

  it("returns true when WebUSB is supported", async () => {
    mockIsSupported.mockResolvedValue(true);
    await expect(new LedgerProvider().isAvailable()).resolves.toBe(true);
  });
});

describe("LedgerProvider.connect", () => {
  it("returns the encoded public key and caches it", async () => {
    const provider = new LedgerProvider();
    const result = await provider.connect();

    expect(result).toBe(EXPECTED_ADDRESS);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockGetPublicKey).toHaveBeenCalledWith("44'/148'/0'");
    // Second call reuses the cached key — no new transport.
    await expect(provider.connect()).resolves.toBe(EXPECTED_ADDRESS);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("registers a disconnect handler on the transport", async () => {
    const provider = new LedgerProvider();
    await provider.connect();
    expect(mockOn).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });

  it("throws a user-friendly error for cancelled device selection", async () => {
    const err = new Error("cancelled");
    err.name = "TransportOpenUserCancelled";
    mockCreate.mockRejectedValue(err);

    await expect(new LedgerProvider().connect()).rejects.toBeInstanceOf(
      LedgerUserCancelledError,
    );
  });

  it("throws user-friendly error on device disconnect during connect", async () => {
    const err = new Error("disconnected");
    err.name = "DisconnectedDeviceDuringOperation";
    mockCreate.mockRejectedValue(err);

    await expect(new LedgerProvider().connect()).rejects.toThrow(
      /Ledger device disconnected/i,
    );
  });
});

describe("LedgerProvider.signXdr", () => {
  async function connectedProvider() {
    const provider = new LedgerProvider();
    await provider.connect();
    return provider;
  }

  it("signs and returns the re-serialized XDR", async () => {
    const provider = await connectedProvider();
    const result = await provider.signXdr("some-xdr");

    expect(mockSignTransaction).toHaveBeenCalledWith(
      "44'/148'/0'",
      expect.any(Buffer),
    );
    expect(result).toBe("some-xdr-signed");
  });

  it("throws when not connected", async () => {
    const provider = new LedgerProvider();
    await expect(provider.signXdr("some-xdr")).rejects.toThrow(
      /Ledger wallet is not connected/i,
    );
  });
});

describe("LedgerProvider.disconnect", () => {
  it("closes the transport and clears state", async () => {
    const provider = new LedgerProvider();
    await provider.connect();
    await provider.disconnect();

    expect(mockClose).toHaveBeenCalledOnce();
    await expect(provider.signXdr("x")).rejects.toThrow(/not connected/i);
  });

  it("ignores close errors (device already disconnected)", async () => {
    mockClose.mockRejectedValue(new Error("already closed"));
    const provider = new LedgerProvider();
    await provider.connect();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });
});