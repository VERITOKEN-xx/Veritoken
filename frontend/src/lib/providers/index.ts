/**
 * Provider registry — resolves a `WalletProviderType` to a concrete
 * provider instance.  Keeps the `useWallet` store free of wallet-specific
 * imports and centralises constructor options (network, pairing callbacks).
 */

import { FreighterProvider } from "./freighterProvider";
import { LedgerProvider } from "./ledgerProvider";
import { WalletConnectProvider, type OnPairingUri } from "./walletConnectProvider";
import type { WalletProvider, WalletProviderType } from "../walletProvider";

export interface ProviderRegistryOptions {
  network?: string;
  onPairingUri?: OnPairingUri;
}

/**
 * Resolve `type` to a fresh provider instance.  WalletConnect receives the
 * current network + pairing callback so the QR flow can drive the UI.
 */
export function createProvider(
  type: WalletProviderType,
  opts: ProviderRegistryOptions = {},
): WalletProvider {
  switch (type) {
    case "freighter":
      return new FreighterProvider();
    case "ledger":
      return new LedgerProvider();
    case "walletconnect":
      return new WalletConnectProvider({
        network: opts.network ?? "testnet",
        onPairingUri: opts.onPairingUri ?? (() => {}),
      });
  }
}