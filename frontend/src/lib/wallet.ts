/**
 * Wallet Zustand store (issues #381 + #382)
 *
 * Uses the WalletAdapter abstraction so the store is provider-agnostic (#382)
 * and adds explicit resilience for common lifecycle failures (#381):
 *   - Extension not installed → clear user message
 *   - User rejects request → distinct error state, retry available
 *   - Account-change events → re-sync address automatically
 *   - Network errors → `connectionError` field, not a silent swallow
 */

import { create } from "zustand";
import type { WalletState } from "../types";
import { getNetworkPassphrase } from "./stellar";
import {
  selectAdapter,
  type WalletAdapter,
} from "./walletAdapter";

// ---------------------------------------------------------------------------
// Extended store interface
// ---------------------------------------------------------------------------

export interface WalletStore extends WalletState {
  /** Human-readable description of the last connection error, or null. */
  connectionError: string | null;
  /** True while a connect / signTx operation is in-flight. */
  loading: boolean;
  /** The active adapter name, e.g. "Freighter" or "No wallet". */
  adapterName: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  /** Clear `connectionError` — call from the retry button in the UI. */
  clearError: () => void;
  signTx: (xdr: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Singleton adapter, resolved lazily. */
let _adapter: WalletAdapter | null = null;

async function getAdapter(): Promise<WalletAdapter> {
  if (!_adapter) {
    _adapter = await selectAdapter();
  }
  return _adapter;
}

/** Normalise any thrown value into a user-friendly message. */
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWallet = create<WalletStore>((set, get) => ({
  address: null,
  network: "TESTNET",
  connected: false,
  connectionError: null,
  loading: false,
  adapterName: null,

  // ── Connect ──────────────────────────────────────────────────────────────
  connect: async () => {
    set({ loading: true, connectionError: null });
    try {
      const adapter = await getAdapter();
      set({ adapterName: adapter.name });

      const address = await adapter.connect();
      set({ address, connected: true, loading: false, connectionError: null });

      // #381 – account-change resilience: listen for Freighter's
      // `accountChanged` window event (fired when the user switches accounts).
      // This event is not part of every adapter, so we guard against its
      // absence rather than wiring it inside the adapter itself.
      if (typeof window !== "undefined") {
        window.removeEventListener("freighterAccountChanged", _onAccountChanged);
        window.addEventListener("freighterAccountChanged", _onAccountChanged);
      }
    } catch (err) {
      set({
        address: null,
        connected: false,
        loading: false,
        connectionError: toMessage(err),
      });
    }
  },

  // ── Disconnect ───────────────────────────────────────────────────────────
  disconnect: () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("freighterAccountChanged", _onAccountChanged);
    }
    _adapter = null; // allow fresh adapter selection next time
    set({
      address: null,
      connected: false,
      connectionError: null,
      loading: false,
      adapterName: null,
    });
  },

  // ── Clear error ──────────────────────────────────────────────────────────
  clearError: () => set({ connectionError: null }),

  // ── Sign transaction ──────────────────────────────────────────────────────
  signTx: async (xdr: string) => {
    const { address, connected } = get();
    if (!connected || !address) {
      throw new Error(
        "Wallet not connected. Please connect your wallet before signing transactions.",
      );
    }

    set({ loading: true });
    try {
      const adapter = await getAdapter();
      const passphrase = getNetworkPassphrase();
      const signed = await adapter.signTransaction(xdr, passphrase);
      set({ loading: false });
      return signed;
    } catch (err) {
      set({ loading: false });
      throw new Error(`Transaction signing failed: ${toMessage(err)}`);
    }
  },
}));

// ---------------------------------------------------------------------------
// Account-change handler (#381)
// ---------------------------------------------------------------------------

/**
 * Re-sync the address when the user switches accounts in Freighter.
 * This fires asynchronously; we update the store without showing an error.
 */
async function _onAccountChanged() {
  const adapter = await getAdapter();
  try {
    const address = await adapter.connect();
    useWallet.setState({ address, connected: true, connectionError: null });
  } catch {
    // If the new account can't be resolved, treat it as a disconnect so the
    // user sees the connect prompt rather than stale state.
    useWallet.getState().disconnect();
  }
}
