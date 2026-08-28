/**
 * Unit tests for loadConfig() — covers the POLL_INTERVAL_MS NaN guard
 * introduced in issue #606.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We re-import loadConfig fresh for each test by manipulating env vars
// directly and re-calling the function (it reads process.env at call time).
import { loadConfig } from "../config.js";

const BASE_ENV = {
  RPC_URL: "http://localhost:8000",
  STELLAR_NETWORK: "testnet",
};

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

describe("loadConfig — POLL_INTERVAL_MS NaN guard (#606)", () => {
  it("throws when POLL_INTERVAL_MS is a non-numeric string", () => {
    withEnv({ ...BASE_ENV, POLL_INTERVAL_MS: "abc" }, () => {
      expect(() => loadConfig()).toThrow("POLL_INTERVAL_MS must be a positive integer");
    });
  });

  it("throws when POLL_INTERVAL_MS is set to 0", () => {
    withEnv({ ...BASE_ENV, POLL_INTERVAL_MS: "0" }, () => {
      expect(() => loadConfig()).toThrow("POLL_INTERVAL_MS must be a positive integer");
    });
  });

  it("throws when POLL_INTERVAL_MS is negative", () => {
    withEnv({ ...BASE_ENV, POLL_INTERVAL_MS: "-1" }, () => {
      expect(() => loadConfig()).toThrow("POLL_INTERVAL_MS must be a positive integer");
    });
  });

  it("succeeds with a valid positive integer", () => {
    withEnv({ ...BASE_ENV, POLL_INTERVAL_MS: "3000" }, () => {
      const config = loadConfig();
      expect(config.pollIntervalMs).toBe(3000);
    });
  });

  it("defaults to 5000 when POLL_INTERVAL_MS is not set", () => {
    withEnv({ ...BASE_ENV, POLL_INTERVAL_MS: undefined }, () => {
      const config = loadConfig();
      expect(config.pollIntervalMs).toBe(5000);
    });
  });
});
