/**
 * Ledger Hardware Wallet implementation of {@link WalletProvider}.
 *
 * Communicates with the Stellar Ledger application over WebUSB.  Because
 * WebUSB requires a secure context (HTTPS) and a Chromium-based browser,
 * `isAvailable()` returns `false` in all other environments so the UI can
 * gracefully hide the Ledger option.
 *
 * The flow follows the standard Ledger + Stellar integration:
 *   1. `connect()` opens a WebUSB transport and reads the public key at the
 *      Stellar derivation path (`44'/148'/0'`, account index 0).
 *   2. `signXdr()` feeds the transaction's *signature base* (which already
 *      contains the network passphrase) to the device and splices the
 *      returned signature into the envelope via `Transaction.addSignature`.
 *
 * @module
 */

import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import StellarApp from "@ledgerhq/hw-app-str";
import { StrKey, Transaction } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "../stellar";
import type { WalletProvider, WalletProviderType } from "../walletProvider";

const STELLAR_DERIVATION_PATH = "44'/148'/0'";

/**
 * Error thrown when the user cancels the WebUSB device picker.
 * The UI catches this to show a gentle "cancelled" message instead of a
 * hard error.
 */
export class LedgerUserCancelledError extends Error {
  constructor() {
    super("Device selection cancelled.");
    this.name = "LedgerUserCancelledError";
  }
}

export class LedgerProvider implements WalletProvider {
  readonly type: WalletProviderType = "ledger";

  private _transport: TransportWebUSB | null = null;
  private _app: StellarApp | null = null;
  private _publicKey: string | null = null;

  // ── Public API ────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined") return false;
    return TransportWebUSB.isSupported();
  }

  async connect(): Promise<string> {
    if (this._publicKey) return this._publicKey; // already connected

    const transport = await this._openTransport();
    const app = new StellarApp(transport);
    const { rawPublicKey } = await app.getPublicKey(STELLAR_DERIVATION_PATH);
    const publicKey = StrKey.encodeEd25519PublicKey(rawPublicKey);

    this._transport = transport;
    this._app = app;
    this._publicKey = publicKey;
    return publicKey;
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this._app = null;
    if (this._transport) {
      try {
        await this._transport.close();
      } catch {
        // Transport may already be closed (device unplugged); ignore.
      }
      this._transport = null;
    }
  }

  async signXdr(xdr: string): Promise<string> {
    const app = this._ensureConnected();
    const publicKey = this._publicKey!;

    // Parse the envelope with the app's current network passphrase so the
    // signature base the device signs matches exactly what the network will
    // verify.
    const tx = new Transaction(xdr, NETWORK_PASSPHRASE);
    const signatureBase = tx.signatureBase();

    const { signature } = await app.signTransaction(
      STELLAR_DERIVATION_PATH,
      signatureBase,
    );

    // `addSignature` computes the correct SignatureHint from the public key
    // and appends the DecoratedSignature to the envelope.
    tx.addSignature(publicKey, signature.toString("base64"));
    return tx.toXDR();
  }

  /**
   * Convenience factory so callers can treat every provider uniformly
   * (`await LedgerProvider.create()`).
   */
  static async create(): Promise<LedgerProvider> {
    return new LedgerProvider();
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private _ensureConnected(): StellarApp {
    if (!this._app || !this._transport) {
      throw new Error("Ledger wallet is not connected.");
    }
    return this._app;
  }

  /**
   * Open the WebUSB transport, handling the two most common user-facing
   * failures (cancellation and mid-flight disconnection).
   */
  private async _openTransport(): Promise<TransportWebUSB> {
    if (!TransportWebUSB.isSupported()) {
      throw new Error(
        "WebUSB is not supported in this browser. Please use Chrome or Edge.",
      );
    }

    let transport: TransportWebUSB;
    try {
      // `Transport.create()` is typed to return the base `Transport`;
      // WebUSB's factory returns an instance of this subclass.
      transport = (await TransportWebUSB.create()) as TransportWebUSB;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "TransportOpenUserCancelled") {
        throw new LedgerUserCancelledError();
      }
      if (
        err instanceof Error &&
        (err.name === "DisconnectedDevice" ||
          err.name === "DisconnectedDeviceDuringOperation")
      ) {
        throw new Error(
          "Ledger device disconnected during connection. " +
            "Please reconnect and try again.",
        );
      }
      throw err;
    }

    transport.on("disconnect", () => {
      // Clean up internal state when the device is unplugged mid-session.
      this._publicKey = null;
      this._app = null;
      this._transport = null;
    });

    return transport;
  }
}