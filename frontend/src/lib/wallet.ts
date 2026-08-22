import { create } from "zustand";
import { buildSep7Uri, isFreighterAvailable, isMobile, openSep7Link } from "./sep7";
import { NETWORK_PASSPHRASE } from "./stellar";
import { recordSessionAction } from "./sessionHistory";
import { createProvider, type ProviderRegistryOptions } from "./providers/index";
import type { WalletProvider, WalletProviderType } from "./walletProvider";
import { PROVIDER_TYPE_KEY } from "./walletProvider";
import type { WalletState } from "../types";

// ── Store interface ─────────────────────────────────────────────────────

interface WalletStore extends WalletState {
  /** The currently active provider type. */
  providerType: WalletProviderType;
  /** All provider types supported by the application. */
  providerTypeList: WalletProviderType[];

  /** Connect using the current provider. */
  connect: () => Promise<void>;
  /** Disconnect the current provider. */
  disconnect: () => void;
  /**
   * Sign a transaction envelope with the current provider.
   * @param xdr — base64-encoded TransactionEnvelope
   */
  signTx: (xdr: string) => Promise<string>;

  /**
   * Generates a SEP-7 `stellar:sign` URI for the given XDR and opens it as a
   * deep link.  For mobile users this hands off to the device's registered
   * Stellar wallet (LOBSTR, xBull, etc.).  On desktop the URI can be scanned
   * via the QR code shown in WalletGuard.
   *
   * Because mobile wallets sign and submit independently, this path does NOT
   * return a signed XDR — it returns the URI so the caller can display / poll.
   */
  signTxSep7: (xdr: string, opts?: { msg?: string; callback?: string }) => string;

  /** Whether Freighter was detected on the last `connect` attempt. */
  freighterAvailable: boolean;
  /** Whether the current device is mobile (set once on first `connect`). */
  onMobile: boolean;

  /**
   * Switch to a different wallet provider.  If the provider is already
   * connected, the switch disconnects the old one and connects the new one.
   * Calling this while disconnected stores the preference for the next
   * `connect()` call.
   */
  selectProvider: (type: WalletProviderType) => Promise<void>;

  /** Low-level access to the active provider instance (for tests / guards). */
  _provider: WalletProvider | null;
}

// ── Default provider ────────────────────────────────────────────────────

const DEFAULT_PROVIDER: WalletProviderType = "freighter";
const PROVIDER_TYPE_LIST: WalletProviderType[] = ["freighter", "ledger", "walletconnect"];

// ── Store ───────────────────────────────────────────────────────────────

export const useWallet = create<WalletStore>((set, get) => {
  // Internal provider instance (not persisted — recreated on reload).
  let _provider: WalletProvider | null = null;

  /**
   * Resolve the stored provider type (or default) and create the
   * corresponding provider instance.
   */
  function resolveProvider(type: WalletProviderType, opts?: ProviderRegistryOptions): WalletProvider {
    const provider = createProvider(type, opts);
    _provider = provider;
    return provider;
  }

  /**
   * Load the persisted provider type from localStorage.
   */
  function loadProviderType(): WalletProviderType {
    if (typeof localStorage === "undefined") return DEFAULT_PROVIDER;
    try {
      const stored = localStorage.getItem(PROVIDER_TYPE_KEY);
      if (stored && PROVIDER_TYPE_LIST.includes(stored as WalletProviderType)) {
        return stored as WalletProviderType;
      }
    } catch {
      // localStorage may be unavailable (private browsing).
    }
    return DEFAULT_PROVIDER;
  }

  /**
   * Persist the chosen provider type to localStorage.
   */
  function saveProviderType(type: WalletProviderType): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(PROVIDER_TYPE_KEY, type);
    } catch {
      // Silently ignore storage errors.
    }
  }

  const initialType = loadProviderType();
  resolveProvider(initialType);

  return {
      address: null,
      network: "TESTNET",
      connected: false,
      freighterAvailable: false,
      onMobile: isMobile(),
      providerType: initialType,
      providerTypeList: PROVIDER_TYPE_LIST,
      _provider: _provider??null,

    // ── connect ────────────────────────────────────────────────────────
    connect: async () => {
      const mobile = isMobile();
      const freighter = await isFreighterAvailable();
      set({ freighterAvailable: freighter, onMobile: mobile });

      const provider = _provider;
      if (!provider) {
        throw new Error("No wallet provider is configured.");
      }

      const address = await provider.connect();
      set({ address, connected: true, onMobile: mobile });
      recordSessionAction("wallet", "Wallet connected", undefined, address);
    },

    // ── disconnect ─────────────────────────────────────────────────────
    disconnect: () => {
      const { address } = get();
      _provider?.disconnect().catch(() => {});
      set({ address: null, connected: false });
      recordSessionAction("wallet", "Wallet disconnected", undefined, address ?? undefined);
    },

    // ── signTx ─────────────────────────────────────────────────────────
    signTx: async (xdr: string) => {
      const { address } = get();
      if (!address) throw new Error("Wallet not connected");
      const provider = _provider;
      if (!provider) throw new Error("No wallet provider is configured.");
      return provider.signXdr(xdr);
    },

    // ── signTxSep7 (unchanged, SEP-7 specific) ─────────────────────────
    signTxSep7: (xdr: string, opts = {}) => {
      const uri = buildSep7Uri({
        xdr,
        networkPassphrase: NETWORK_PASSPHRASE,
        msg: opts.msg,
        callback: opts.callback,
      });
      openSep7Link(uri);
      return uri;
    },

    // ── selectProvider ─────────────────────────────────────────────────
    selectProvider: async (type: WalletProviderType) => {
      const { connected } = get();

      // Disconnect the current provider if connected.
      if (connected) {
        _provider?.disconnect().catch(() => {});
        set({ address: null, connected: false });
      }

      // Create and (optionally) connect the new provider.
      const newProvider = createProvider(type);
      _provider = newProvider;
      set({ providerType: type, _provider: newProvider });

      saveProviderType(type);

      if (connected) {
        try {
          const address = await newProvider.connect();
          set({ address, connected: true });
        } catch {
          // If reconnection fails, stay disconnected.
          set({ address: null, connected: false });
        }
      }
    },
  };
});

// ── Auto-reconnect (module init) ────────────────────────────────────────
// When the app loads, check if the last-used provider can reconnect.
// This runs once per page load; errors are swallowed so the user can
// manually connect if the session expired.

function attemptAutoReconnect(): void {
  if (typeof localStorage === "undefined") return;

  try {
    const storedType = localStorage.getItem(PROVIDER_TYPE_KEY) as WalletProviderType | null;
    if (!storedType || !PROVIDER_TYPE_LIST.includes(storedType)) return;

    const provider = createProvider(storedType);
    const state = useWallet.getState();

    // Don't reconnect if already connected (avoid race on hot-reload).
    if (state.connected) return;

    void provider.isAvailable().then((available) => {
      if (!available) return;
      return provider.connect().then((address) => {
        useWallet.setState({
          address,
          connected: true,
          providerType: storedType,
          _provider: provider,
          onMobile: isMobile(),
        });
      });
    }).catch(() => {
      // Silently ignore — the user can reconnect manually.
    });
  } catch {
    // Silently ignore.
  }
}

attemptAutoReconnect();

// ── Re-exports ──────────────────────────────────────────────────────────
export { isFreighterAvailable, isMobile, buildSep7Uri, generateQrDataUrl } from "./sep7";