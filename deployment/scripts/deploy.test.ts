/**
 * deploy.test.ts — Regression tests for parseContractIds
 *
 * Covers the boundary condition where empty or whitespace-only contract
 * identifiers slip through a naive split(), creating ambiguous manifests
 * that fail silently in later deployment or verification steps.
 */

import { describe, it, expect } from "vitest";
import { loadConfig, parseContractIds } from "./deploy.ts";

describe("parseContractIds", () => {
  // ── Happy-path ──────────────────────────────────────────────────────────────

  it("parses a single contract id", () => {
    expect(parseContractIds("kyc-registry")).toEqual(["kyc-registry"]);
  });

  it("parses multiple comma-separated ids", () => {
    expect(parseContractIds("kyc-registry,rwa-token,compliance-engine")).toEqual([
      "kyc-registry",
      "rwa-token",
      "compliance-engine",
    ]);
  });

  it("trims surrounding whitespace from each entry", () => {
    expect(parseContractIds("  kyc-registry , rwa-token  ")).toEqual([
      "kyc-registry",
      "rwa-token",
    ]);
  });

  // ── Rejection cases — the boundary conditions the fix addresses ────────────

  it("rejects a trailing comma (produces empty final entry)", () => {
    expect(() => parseContractIds("kyc-registry,")).toThrow(
      /empty contract identifier/
    );
  });

  it("rejects a leading comma (produces empty first entry)", () => {
    expect(() => parseContractIds(",rwa-token")).toThrow(
      /empty contract identifier/
    );
  });

  it("rejects a double comma (produces empty middle entry)", () => {
    expect(() => parseContractIds("kyc-registry,,rwa-token")).toThrow(
      /empty contract identifier/
    );
  });

  it("rejects a whitespace-only entry", () => {
    expect(() => parseContractIds("kyc-registry,   ,rwa-token")).toThrow(
      /empty contract identifier/
    );
  });

  it("rejects a string that is entirely whitespace", () => {
    expect(() => parseContractIds("   ")).toThrow(/empty contract identifier/);
  });

  it("rejects an empty string", () => {
    expect(() => parseContractIds("")).toThrow(/empty contract identifier/);
  });
});

describe("loadConfig", () => {
  const configWith = (name: unknown) =>
    JSON.stringify({
      schema_version: 1,
      profile: "testnet",
      contracts: [{ name, artifact: "a.wasm", env_key: "A", dependencies: [] }],
    });

  it("accepts a contract with a non-empty name", () => {
    expect(loadConfig(configWith("kyc-registry")).contracts[0].name).toBe(
      "kyc-registry"
    );
  });

  it.each(["", "   ", undefined])("rejects blank contract name %j", (name) => {
    expect(() => loadConfig(configWith(name))).toThrow(/non-empty name/);
  });
});
