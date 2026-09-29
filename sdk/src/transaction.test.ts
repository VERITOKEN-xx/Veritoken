import { describe, it, expect } from "vitest";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { buildContractTx, buildTransferTx } from "./transaction.js";

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

  it.each(["", "   ", "not-a-key", "GXXXINVALID"])("rejects invalid source %j", (source) => {
    expect(() =>
      buildContractTx(CONTRACT_ID, "transfer", [], Networks.TESTNET, source, "1"),
    ).toThrow(/source must be a valid Stellar account address/);
  });

  it("accepts a valid G… source address", () => {
    const source = Keypair.random().publicKey();
    const xdr = buildContractTx(CONTRACT_ID, "transfer", [], Networks.TESTNET, source, "1");
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(0);
  });
});

describe("buildTransferTx", () => {
  it("builds a transfer transaction without a memo", () => {
    const xdr = buildTransferTx(CONTRACT_ID, [], Networks.TESTNET);
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(0);
  });

  it("builds a transfer transaction with a meaningful memo", () => {
    const xdr = buildTransferTx(
      CONTRACT_ID,
      [],
      Networks.TESTNET,
      Keypair.random().publicKey(),
      "1",
      "payment-ref-123",
    );
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(0);
  });

  it.each(["", "   ", "\t"])("rejects blank memo %j", (memo) => {
    expect(() =>
      buildTransferTx(
        CONTRACT_ID,
        [],
        Networks.TESTNET,
        Keypair.random().publicKey(),
        "1",
        memo,
      ),
    ).toThrow(/memo must not be blank/);
  });
});
