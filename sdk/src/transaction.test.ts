import { describe, it, expect } from "vitest";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { buildContractTx } from "./transaction.js";

const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));

describe("buildContractTx", () => {
  it("builds a transaction for a valid method name", () => {
    const xdr = buildContractTx(CONTRACT_ID, "name", [], Networks.TESTNET);
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(0);
  });

  it.each(["", "   ", "\t"])("rejects blank method %j", (method) => {
    expect(() =>
      buildContractTx(
        CONTRACT_ID,
        method,
        [],
        Networks.TESTNET,
        Keypair.random().publicKey(),
        "1",
      ),
    ).toThrow(/method must be a non-empty string/);
  });

  it.each([
    "",
    "not-an-address",
    ` ${Keypair.random().publicKey()}`,
    Keypair.random().secret(),
    CONTRACT_ID,
  ])("rejects invalid source account %j", (source) => {
    expect(() =>
      buildContractTx(CONTRACT_ID, "name", [], Networks.TESTNET, source, "1"),
    ).toThrow(/source must be a valid Stellar account address/);
  });

  it("accepts a valid G… source account", () => {
    const xdr = buildContractTx(
      CONTRACT_ID,
      "name",
      [],
      Networks.TESTNET,
      Keypair.random().publicKey(),
      "1",
    );
    expect(xdr.length).toBeGreaterThan(0);
  });
});
