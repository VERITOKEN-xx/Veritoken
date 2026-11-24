import { describe, it, expect, vi } from "vitest";
import { Networks, nativeToScVal } from "@stellar/stellar-sdk";
import { checkHealth, MALFORMED_RPC_RESPONSE_PREFIX } from "../health.js";
import { ComplianceEngineClient } from "./ComplianceEngineClient.js";
import { KycRegistryClient } from "./KycRegistryClient.js";
import { RwaTokenClient } from "./RwaTokenClient.js";
import { mockServer, simSuccess } from "../testing/mockRpc.js";

const PASSPHRASE = Networks.TESTNET;
const CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const RULES_VAL = nativeToScVal(
  {
    max_transfer_amount: 0n,
    min_holding_period: 0n,
    max_holders: 0,
    require_same_jurisdiction: false,
    paused: false,
    allowlist_mode: false,
    max_holding_period: 0n,
  },
  { type: "instance" },
);

describe("ComplianceEngineClient.health()", () => {
  it("returns reachable=true with paused and holderCount when RPC is up", async () => {
    const srv = mockServer({
      simulateByMethod: {
        get_rules: simSuccess(RULES_VAL),
        holder_count: simSuccess(nativeToScVal(5, { type: "u32" })),
      },
    });
    const c = new ComplianceEngineClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(true);
    expect(h.latestLedger).toBe(1000);
    expect(typeof h.checkedAt).toBe("string");
    expect(h.paused).toBe(false);
    expect(h.holderCount).toBe(5);
  });

  it("returns reachable=false when RPC throws", async () => {
    const srv = mockServer();
    (srv.getLatestLedger as ReturnType<typeof import("vitest").vi.fn>).mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const c = new ComplianceEngineClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(false);
    expect(h.latestLedger).toBeNull();
    expect(h.paused).toBeNull();
    expect(h.holderCount).toBeNull();
    expect(h.error).toMatch("connection refused");
  });

  it("reports an RPC timeout as unavailable with its diagnostic message", async () => {
    const srv = mockServer();
    const timeout = Object.assign(new Error("RPC request timed out after 5000ms"), {
      code: "ETIMEDOUT",
    });
    (srv.getLatestLedger as ReturnType<typeof import("vitest").vi.fn>).mockRejectedValueOnce(
      timeout,
    );
    const c = new ComplianceEngineClient(CONTRACT_ID, srv, PASSPHRASE);

    const h = await c.health();

    expect(h.reachable).toBe(false);
    expect(h.latestLedger).toBeNull();
    expect(h.paused).toBeNull();
    expect(h.holderCount).toBeNull();
    expect(h.error).toBe("RPC request timed out after 5000ms");
  });
});

describe("KycRegistryClient.health()", () => {
  it("returns reachable=true with verifierCount", async () => {
    const srv = mockServer({
      simulateByMethod: {
        verifier_count: simSuccess(nativeToScVal(3, { type: "u32" })),
      },
    });
    const c = new KycRegistryClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(true);
    expect(h.verifierCount).toBe(3);
  });

  it("returns reachable=false when RPC throws", async () => {
    const srv = mockServer();
    (srv.getLatestLedger as ReturnType<typeof import("vitest").vi.fn>).mockRejectedValueOnce(
      new Error("timeout"),
    );
    const c = new KycRegistryClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(false);
    expect(h.verifierCount).toBeNull();
  });
});

describe("RwaTokenClient.health()", () => {
  it("returns reachable=true with totalSupply", async () => {
    const srv = mockServer({
      simulateByMethod: {
        total_supply: simSuccess(nativeToScVal(1_000_000n, { type: "i128" })),
      },
    });
    const c = new RwaTokenClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(true);
    expect(h.totalSupply).toBe(1_000_000n);
  });

  it("returns reachable=false when RPC throws", async () => {
    const srv = mockServer();
    (srv.getLatestLedger as ReturnType<typeof import("vitest").vi.fn>).mockRejectedValueOnce(
      new Error("network error"),
    );
    const c = new RwaTokenClient(CONTRACT_ID, srv, PASSPHRASE);
    const h = await c.health();
    expect(h.reachable).toBe(false);
    expect(h.totalSupply).toBeNull();
  });
});

// ── Malformed RPC payloads (#984) ───────────────────────────────────────────
//
// A 200 OK with an unexpected body is not proof of a healthy Soroban endpoint.
// This fixture is a getLatestLedger response missing the required `sequence`.
const MALFORMED_LATEST_LEDGER = { id: "mock", protocolVersion: 21 };

describe("checkHealth() — malformed RPC response (#984)", () => {
  it("does not report healthy when getLatestLedger omits `sequence`", async () => {
    const srv = mockServer();
    vi.mocked(srv.getLatestLedger).mockResolvedValueOnce(
      MALFORMED_LATEST_LEDGER as unknown as Awaited<ReturnType<typeof srv.getLatestLedger>>,
    );

    const h = await checkHealth(srv, CONTRACT_ID);

    expect(h.reachable).toBe(false);
    expect(h.latestLedger).toBeNull();
    expect(h.recentEventCount).toBe(0);
    expect(h.error).toBe(
      `${MALFORMED_RPC_RESPONSE_PREFIX}: getLatestLedger returned no valid \`sequence\``,
    );
    // Classified before any further RPC calls are made on bad data.
    expect(srv.getEvents).not.toHaveBeenCalled();
  });

  it("does not report healthy when getEvents omits `events`", async () => {
    const srv = mockServer({
      getEvents: { latestLedger: 1000 } as unknown as Awaited<ReturnType<typeof srv.getEvents>>,
    });

    const h = await checkHealth(srv, CONTRACT_ID);

    expect(h.reachable).toBe(false);
    expect(h.latestLedger).toBeNull();
    expect(h.error).toBe(`${MALFORMED_RPC_RESPONSE_PREFIX}: getEvents returned no \`events\` array`);
  });

  it("still reports a well-formed payload as healthy", async () => {
    const srv = mockServer({ latestLedger: 4242 });

    const h = await checkHealth(srv, CONTRACT_ID);

    expect(h.reachable).toBe(true);
    expect(h.latestLedger).toBe(4242);
    expect(h.recentEventCount).toBe(0);
    expect(h.error).toBeUndefined();
  });

  it("propagates the malformed classification through a client health()", async () => {
    const srv = mockServer({
      simulateByMethod: {
        verifier_count: simSuccess(nativeToScVal(3, { type: "u32" })),
      },
    });
    vi.mocked(srv.getLatestLedger).mockResolvedValueOnce(
      MALFORMED_LATEST_LEDGER as unknown as Awaited<ReturnType<typeof srv.getLatestLedger>>,
    );
    const c = new KycRegistryClient(CONTRACT_ID, srv, PASSPHRASE);

    const h = await c.health();

    expect(h.reachable).toBe(false);
    expect(h.verifierCount).toBeNull();
    expect(h.error?.startsWith(MALFORMED_RPC_RESPONSE_PREFIX)).toBe(true);
  });
});
