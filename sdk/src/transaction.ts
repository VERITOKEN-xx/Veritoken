/**
 * Canonical Soroban contract-call transaction builder.
 *
 * Every SDK and frontend read/write path delegates here so fee, timeout,
 * operation payload, source, and network handling cannot drift.
 */
import {
  Account,
  Contract,
  Keypair,
  Memo,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";

export interface BuildTxOptions {
  fee?: string;
  timeoutSeconds?: number;
}

// Stable for the lifetime of the module and used only for read simulation.
export const SIM_SOURCE = Keypair.random().publicKey();

/**
 * Build a single-operation contract-call transaction and return its XDR.
 *
 * When `source` and `sequence` are omitted, the transaction uses a disposable
 * simulation account. Both must be provided together for signed writes.
 */
export function buildContractTx(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  networkPassphrase: string,
  source?: string,
  sequence?: string,
  opts: BuildTxOptions = {},
): string {
  if (typeof method !== "string" || method.trim() === "") {
    throw new Error("method must be a non-empty string");
  }
  if ((source === undefined) !== (sequence === undefined)) {
    throw new Error("source and sequence must be provided together");
  }
  if (
    source !== undefined &&
    (typeof source !== "string" ||
      (!StrKey.isValidEd25519PublicKey(source) &&
        !StrKey.isValidMed25519PublicKey(source)))
  ) {
    throw new Error("source must be a valid Stellar account address (G… or M…)");
  }

  if (source !== undefined && !StrKey.isValidEd25519PublicKey(source)) {
    throw new Error("source must be a valid Stellar account address (G…)");
  }

  const account =
    source !== undefined && sequence !== undefined
      ? new Account(source, sequence)
      : new Account(SIM_SOURCE, "0");

  return new TransactionBuilder(account, {
    fee: opts.fee ?? "100",
    networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(opts.timeoutSeconds ?? 30)
    .build()
    .toXDR();
}

/**
 * Build a token-transfer contract-call transaction and return its XDR.
 *
 * `memo` is optional. Pass a non-empty string to attach a text memo to the
 * transaction. An empty or whitespace-only string is rejected — callers that
 * do not need a memo should omit the parameter entirely.
 */
export function buildTransferTx(
  contractId: string,
  args: xdr.ScVal[],
  networkPassphrase: string,
  source?: string,
  sequence?: string,
  memo?: string,
  opts: BuildTxOptions = {},
): string {
  if (memo !== undefined && memo.trim() === "") {
    throw new Error(
      "memo must not be blank; omit the parameter to send without a memo",
    );
  }
  if ((source === undefined) !== (sequence === undefined)) {
    throw new Error("source and sequence must be provided together");
  }

  const account =
    source !== undefined && sequence !== undefined
      ? new Account(source, sequence)
      : new Account(SIM_SOURCE, "0");

  const builder = new TransactionBuilder(account, {
    fee: opts.fee ?? "100",
    networkPassphrase,
  })
    .addOperation(new Contract(contractId).call("transfer", ...args))
    .setTimeout(opts.timeoutSeconds ?? 30);

  if (memo !== undefined) {
    builder.addMemo(Memo.text(memo));
  }

  return builder.build().toXDR();
}
