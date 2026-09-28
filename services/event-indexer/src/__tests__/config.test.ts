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

describe("loadConfig — PORT range validation", () => {
  it("throws when PORT is 0", () => {
    withEnv({ ...BASE_ENV, PORT: "0" }, () => {
      expect(() => loadConfig()).toThrow("PORT must be an integer between 1 and 65535");
    });
  });

  it("throws when PORT is negative", () => {
    withEnv({ ...BASE_ENV, PORT: "-1" }, () => {
      expect(() => loadConfig()).toThrow("PORT must be an integer between 1 and 65535");
    });
  });

  it("throws when PORT exceeds 65535", () => {
    withEnv({ ...BASE_ENV, PORT: "65536" }, () => {
      expect(() => loadConfig()).toThrow("PORT must be an integer between 1 and 65535");
    });
  });

  it("throws when PORT is a non-numeric string", () => {
    withEnv({ ...BASE_ENV, PORT: "abc" }, () => {
      expect(() => loadConfig()).toThrow("PORT must be an integer between 1 and 65535");
    });
  });

  it("accepts PORT at the lower boundary (1)", () => {
    withEnv({ ...BASE_ENV, PORT: "1" }, () => {
      const config = loadConfig();
      expect(config.port).toBe(1);
    });
  });

  it("accepts PORT at the upper boundary (65535)", () => {
    withEnv({ ...BASE_ENV, PORT: "65535" }, () => {
      const config = loadConfig();
      expect(config.port).toBe(65535);
    });
  });

  it("defaults to 3001 when PORT is not set", () => {
    withEnv({ ...BASE_ENV, PORT: undefined }, () => {
      const config = loadConfig();
      expect(config.port).toBe(3001);
    });
  });
});

describe("loadConfig — RPC_URL whitespace trimming", () => {
  it("throws when RPC_URL is only spaces", () => {
    withEnv({ ...BASE_ENV, RPC_URL: "   " }, () => {
      expect(() => loadConfig()).toThrow("RPC_URL environment variable is required");
    });
  });

  it("throws when RPC_URL is a tab character", () => {
    withEnv({ ...BASE_ENV, RPC_URL: "\t" }, () => {
      expect(() => loadConfig()).toThrow("RPC_URL environment variable is required");
    });
  });

  it("names every checked env var when no RPC URL is configured", () => {
    withEnv({ ...BASE_ENV, RPC_URL: undefined, STELLAR_RPC_URL: undefined }, () => {
      expect(() => loadConfig()).toThrow(/checked RPC_URL, STELLAR_RPC_URL/);
    });
  });

  it("trims surrounding whitespace and accepts a valid URL", () => {
    withEnv({ ...BASE_ENV, RPC_URL: "  http://localhost:8000  " }, () => {
      const config = loadConfig();
      expect(config.rpcUrl).toBe("http://localhost:8000");
    });
  });
});

describe("parseContracts — blank label rejection", () => {
  it("throws when a label is empty (entry starts with colon)", () => {
    withEnv({ ...BASE_ENV, CONTRACT_IDS: ":CCONTRACTID1111111111111111111111111111111111111111" }, () => {
      expect(() => loadConfig()).toThrow(/blank label/);
    });
  });

  it("throws when a label is only whitespace", () => {
    withEnv({ ...BASE_ENV, CONTRACT_IDS: "   :CCONTRACTID1111111111111111111111111111111111111111" }, () => {
      expect(() => loadConfig()).toThrow(/blank label/);
    });
  });

  it("accepts a well-formed label:contractId pair", () => {
    withEnv({ ...BASE_ENV, CONTRACT_IDS: "rwa:CCONTRACTID1111111111111111111111111111111111111111" }, () => {
      const config = loadConfig();
      expect(config.contracts[0].label).toBe("rwa");
    });
  });
});

describe("parseContracts — duplicate detection", () => {
  it("throws on duplicate labels", () => {
    withEnv(
      {
        ...BASE_ENV,
        CONTRACT_IDS:
          "rwa:CCONTRACTAAA1111111111111111111111111111111111111,rwa:CCONTRACTBBB1111111111111111111111111111111111111",
      },
      () => {
        expect(() => loadConfig()).toThrow(/duplicate label.*rwa/);
      }
    );
  });

  it("throws on duplicate contract IDs", () => {
    withEnv(
      {
        ...BASE_ENV,
        CONTRACT_IDS:
          "alpha:CCONTRACTAAA1111111111111111111111111111111111111,beta:CCONTRACTAAA1111111111111111111111111111111111111",
      },
      () => {
        expect(() => loadConfig()).toThrow(/duplicate contract ID/);
      }
    );
  });

  it("accepts a list with no duplicates", () => {
    withEnv(
      {
        ...BASE_ENV,
        CONTRACT_IDS:
          "alpha:CCONTRACTAAA1111111111111111111111111111111111111,beta:CCONTRACTBBB1111111111111111111111111111111111111",
      },
      () => {
        const config = loadConfig();
        expect(config.contracts).toHaveLength(2);
        expect(config.contracts[0].label).toBe("alpha");
        expect(config.contracts[1].label).toBe("beta");
      }
    );
  });
});

describe("parseContracts — whitespace in label and contract ID segments", () => {
  it("trims whitespace around both the label and the contract ID", () => {
    withEnv(
      { ...BASE_ENV, CONTRACT_IDS: " rwa \t:  CCONTRACTID1111111111111111111111111111111111111111 \t" },
      () => {
        const config = loadConfig();
        expect(config.contracts).toEqual([
          { label: "rwa", contractId: "CCONTRACTID1111111111111111111111111111111111111111" },
        ]);
      }
    );
  });

  it("throws when whitespace remains inside a contract ID", () => {
    withEnv({ ...BASE_ENV, CONTRACT_IDS: "rwa:CCONTRACTID1111 111111111111111111111111111111111111" }, () => {
      expect(() => loadConfig()).toThrow(/whitespace inside an entry/);
    });
  });

  it("throws when whitespace remains inside a label", () => {
    withEnv({ ...BASE_ENV, CONTRACT_IDS: "my rwa:CCONTRACTID1111111111111111111111111111111111111111" }, () => {
      expect(() => loadConfig()).toThrow(/whitespace inside an entry/);
    });
  });
});
