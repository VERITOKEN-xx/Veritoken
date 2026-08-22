/**
 * Unit tests for WalletConnectProvider (#545).
 *
 * Uses a mocked `@walletconnect/sign-client` so the provider's session
 * lifecycle (connect, disconnect, signXdr, session expiry) can be tested
 * without a real wallet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockInit = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());
const mockDisconnect = vi.hoisted(() => vi.fn());
const mockRequest = vi.hoisted(() => vi.fn());
const mockOn = vi.hoisted(() => vi.fn());

vi.mock("@walletconnect/sign-client", () => ({
  default: {
    init: mockInit,
  },
}));

// Stub localStorage for the provider's persistence layer.
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

import { WalletConnectProvider } from "../providers/walletConnectProvider";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    topic: "topic-abc",
    namespaces: {
      stellar: {
        chains: ["stellar:testnet"],
        accounts: ["stellar:testnet:GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890"],
        methods: ["stellar_signXDR"],
        events: [],
      },
    },
    ...overrides,
  };
}

function makeClient() {
  const client = {
    connect: mockConnect,
    disconnect: mockDisconnect,
    request: mockRequest,
    on: mockOn,
  };
  mockInit.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  makeClient();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe("WalletConnectProvider.isAvailable", () => {
  it("returns true in browser environments", async () => {
    await expect(new WalletConnectProvider().isAvailable()).resolves.toBe(true);
  });
});

describe("WalletConnectProvider.connect", () => {
  it("starts a fresh pairing session when no saved session exists", async () => {
    const approval = vi.fn().mockResolvedValue(makeSession());
    mockConnect.mockResolvedValue({ uri: "wc:abc123", approval });

    const provider = new WalletConnectProvider();
    const addr = await provider.connect();

    expect(addr).toMatch(/^G/);
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(approval).toHaveBeenCalledOnce();
    // Session should be persisted.
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "veritoken-walletconnect-session",
      expect.any(String),
    );
  });

  it("restores a persisted session when available", async () => {
    const session = makeSession();
    localStorageMock.setItem(
      "veritoken-walletconnect-session",
      JSON.stringify(session),
    );

    const provider = new WalletConnectProvider();
    const addr = await provider.connect();

    // Should NOT call connect() — restored from localStorage.
    expect(mockConnect).not.toHaveBeenCalled();
    expect(addr).toMatch(/^G/);
  });

  it("throws when the user declines the pairing", async () => {
    mockConnect.mockResolvedValue({
      uri: "wc:abc123",
      approval: vi.fn().mockRejectedValue(new Error("pairing declined")),
    });

    const provider = new WalletConnectProvider();
    await expect(provider.connect()).rejects.toThrow(/declined/i);
  });

  it("throws when the session has no Stellar accounts", async () => {
    const approval = vi.fn().mockResolvedValue({
      topic: "topic-abc",
      namespaces: {
        stellar: {
          chains: ["stellar:testnet"],
          accounts: [], // ← empty
          methods: ["stellar_signXDR"],
          events: [],
        },
      },
    });
    mockConnect.mockResolvedValue({ uri: "wc:abc123", approval });

    const provider = new WalletConnectProvider();
    await expect(provider.connect()).rejects.toThrow(/Stellar account/i);
  });
});

describe("WalletConnectProvider.signXdr", () => {
  it("sends a stellar_signXDR request and returns the signed XDR", async () => {
    mockRequest.mockResolvedValue("signed-xdr-result");
    mockConnect.mockResolvedValue({
      uri: "wc:abc123",
      approval: vi.fn().mockResolvedValue(makeSession()),
    });

    const provider = new WalletConnectProvider();
    await provider.connect();

    const result = await provider.signXdr("some-xdr");
    expect(result).toBe("signed-xdr-result");
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "topic-abc",
        request: expect.objectContaining({
          method: "stellar_signXDR",
          params: expect.objectContaining({ xdr: "some-xdr" }),
        }),
      }),
    );
  });

  it("throws when not connected", async () => {
    const provider = new WalletConnectProvider();
    await expect(provider.signXdr("some-xdr")).rejects.toThrow(/not connected/i);
  });
});

describe("WalletConnectProvider.disconnect", () => {
  it("disconnects the session and clears storage", async () => {
    mockConnect.mockResolvedValue({
      uri: "wc:abc123",
      approval: vi.fn().mockResolvedValue(makeSession()),
    });

    const provider = new WalletConnectProvider();
    await provider.connect();
    await provider.disconnect();

    expect(mockDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic-abc" }),
    );
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      "veritoken-walletconnect-session",
    );
  });

  it("handles disconnect errors gracefully (session already gone)", async () => {
    mockDisconnect.mockRejectedValue(new Error("session not found"));
    mockConnect.mockResolvedValue({
      uri: "wc:abc123",
      approval: vi.fn().mockResolvedValue(makeSession()),
    });

    const provider = new WalletConnectProvider();
    await provider.connect();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });
});

describe("WalletConnectProvider session events", () => {
  it("registers session_expire / session_delete handlers on init", async () => {
    mockConnect.mockResolvedValue({
      uri: "wc:abc123",
      approval: vi.fn().mockResolvedValue(makeSession()),
    });

    const provider = new WalletConnectProvider();
    await provider.connect();

    expect(mockOn).toHaveBeenCalledWith("session_expire", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("session_delete", expect.any(Function));
  });
});