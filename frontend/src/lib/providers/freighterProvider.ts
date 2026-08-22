import {
  getPublicKey,
  isConnected,
  setAllowed,
  signTransaction,
} from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "../stellar";
import { isFreighterAvailable } from "../sep7";
import type { WalletProvider, WalletProviderType } from "../walletProvider";

/**
 * Freighter (browser extension) implementation of {@link WalletProvider}.
 *
 * Wraps `@stellar/freighter-api` with availability detection.  This is the
 * default provider and preserves the historical behaviour of the app: when
 * Freighter is missing, `connect()` throws a descriptive error instead of
 * failing silently.
 */
export class FreighterProvider implements WalletProvider {
  readonly type: WalletProviderType = "freighter";

  isAvailable(): Promise<boolean> {
    return isFreighterAvailable();
  }

  async connect(): Promise<string> {
    if (!(await isFreighterAvailable())) {
      throw new Error(
        "Freighter wallet is not installed or unavailable. Install the Freighter extension or choose another wallet.",
      );
    }
    await setAllowed();
    const address = await getPublicKey();
    if (!address) {
      throw new Error("Freighter returned an empty public key.");
    }
    return address;
  }

  async disconnect(): Promise<void> {
    // Freighter has no server-side session; nothing to tear down.
  }

  async signXdr(xdr: string): Promise<string> {
    if (!isConnected()) {
      throw new Error("Freighter wallet is not connected.");
    }
    return signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE });
  }

  /**
   * Convenience factory so callers can treat every provider uniformly
   * (`await FreighterProvider.create()`).
   */
  static async create(): Promise<FreighterProvider> {
    return new FreighterProvider();
  }
}