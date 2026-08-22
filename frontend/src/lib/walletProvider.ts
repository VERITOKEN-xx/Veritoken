/**
 * Wallet provider abstraction (#545).
 *
 * A `WalletProvider` abstracts a concrete Stellar signing backend behind a
 * minimal three-method surface so the rest of the app never needs to know
 * whether the user is on Freighter, a Ledger Nano over WebUSB, or a
 * WalletConnect v2 wallet.
 */

export type WalletProviderType = "freighter" | "ledger" | "walletconnect";

export interface WalletProvider {
  /** Stable identifier used for persistence + selection. */
  readonly type: WalletProviderType;

  /**
   * Connect to the wallet and return the Stellar public key.
   * Throws with a user-friendly message when the wallet is unavailable,
   * the user cancels, or the device disconnects mid-operation.
   */
  connect(): Promise<string>;

  /** Break the connection (no-op for stateless providers). */
  disconnect(): Promise<void>;

  /** Sign a transaction envelope (base64 XDR) and return the signed XDR. */
  signXdr(xdr: string): Promise<string>;

  /**
   * Cheap availability probe. Should never throw — returns `false` when the
   * provider cannot possibly work in the current environment (e.g. no
   * Freighter extension, non-Chromium browser for WebUSB, etc.).
   */
  isAvailable(): Promise<boolean>;
}

/** LocalStorage key remembering the last-used provider between sessions. */
export const PROVIDER_TYPE_KEY = "veritoken-wallet-provider";