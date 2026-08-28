/**
 * Unit tests for the /health endpoint — covers the maxLagSeconds fix
 * introduced in issue #607.
 *
 * We build the router with a real Express app and drive it with
 * node's built-in http module (no supertest required).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "node:http";
import express from "express";

// ── Hoist mock references ─────────────────────────────────────────────────────

const mockGetAllCursors = vi.hoisted(() => vi.fn());

vi.mock("../db/queries.js", () => ({
  getAllCursors:       mockGetAllCursors,
  queryEvents:        vi.fn(),
  queryViolations:    vi.fn(),
  queryPendingExpiry: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { buildRouter } from "../api/routes.js";
import type { ContractPoller } from "../poller.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePoller(lastLedger: number): ContractPoller {
  return {
    getLastProcessedLedger: () => lastLedger,
  } as unknown as ContractPoller;
}

function getJson(server: http.Server, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
      let raw = "";
      res.on("data", (chunk: string) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
  });
}

function withServer(
  pollers: Map<string, ContractPoller>,
  fn: (server: http.Server) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(buildRouter(pollers));
  const server = http.createServer(app);
  return new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try {
        await fn(server);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllCursors.mockResolvedValue([]);
});

describe("GET /health — maxLagSeconds (#607)", () => {
  it("returns lag_seconds: 60 during cold start (no ledger processed)", async () => {
    const pollers = new Map([["CTEST", makePoller(0)]]);
    await withServer(pollers, async (server) => {
      const { status, body } = await getJson(server, "/health");
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).lag_seconds).toBe(60);
    });
  });

  it("returns lag_seconds: 30 when the poller has processed at least one ledger", async () => {
    const pollers = new Map([["CTEST", makePoller(500)]]);
    await withServer(pollers, async (server) => {
      const { status, body } = await getJson(server, "/health");
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).lag_seconds).toBe(30);
    });
  });

  it("uses the higher bound when one poller is cold and one is active", async () => {
    const pollers = new Map<string, ContractPoller>([
      ["cold",   makePoller(0)],
      ["active", makePoller(999)],
    ]);
    await withServer(pollers, async (server) => {
      const { status, body } = await getJson(server, "/health");
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).lag_seconds).toBe(60);
    });
  });

  it("returns lag_seconds: 0 when there are no pollers", async () => {
    await withServer(new Map(), async (server) => {
      const { status, body } = await getJson(server, "/health");
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).lag_seconds).toBe(0);
    });
  });
});
