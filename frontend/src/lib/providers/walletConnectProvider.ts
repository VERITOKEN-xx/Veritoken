/**
 * WalletConnect v2 implementation of {@link WalletProvider}.
 *
 * Uses `@walletconnect/sign-client` to pair with mobile Stellar wallets
 * (LOBSTR, xBull, …) over the `stellar:*` CAIP-2 namespace.  The provider
 * owns the pairing lifecycle:
 *
 * - `connect()` either restores a persisted session or emits a pairing
 *   proposal and waits for the wallet to approve it.
 * - The resulting QR code / pairing URI is surfaced through the
 *   `onPairingUri` callback so the UI can render it while waiting.
 * - `signXdr()` sends a `stellar_signXDR` request to the connected wallet.
 *
 * Sessions are persisted to `localStorage` so a page refresh reconnects
 * automatically (the wallet only has to re-approve if the session expired).
 *
 * @module
 */

import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import type { WalletProvider, WalletProviderType } from "../walletProvider";

const PROJECT_ID =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  "YOUR_PROJECT_ID";

const SESSION_KEY = "veritoken-walletconnect-session";

const STELLAR_NETWORKS: Record<string, string> = {
  testnet: "stellar:testnet",
  mainnet: "stellar:pubnet",
} as const;

/** Callback invoked with every fresh pairing URI (for QR display). */
export type OnPairingUri = (uri: string | null) => void;

export class WalletConnectProvider implements WalletProvider {
  readonly type: WalletProviderType = "walletconnect";

  private _client: SignClient | null = null;
  private _session: SessionTypes.Struct | null = null;
  private _publicKey: string | null = null;
  private _onPairingUri: OnPairingUri;
  private _network: string;

  constructor(opts?: {
    network?: string;
    onPairingUri?: OnPairingUri;
  }) {
    this._network = opts?.network ?? "testnet";
    this._onPairingUri = opts?.onPairingUri ?? (() => {});
  }

  // ── Public API ────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    // WalletConnect can follow links, so it is technically available in any
    // browser; the selector UI treats it as a primary desktop fallback.
    return true;
  }

  async connect(): Promise<string> {
    const client = await this._getClient();
    const existing = await this._loadSession();

    if (existing) {
      // Validate the session still matches the current network.
      if (this._sessionMatchesNetwork(existing)) {
        this._session = existing;
        const address = this._extractStellarAccount(existing);
        if (address) {
          this._publicKey = address;
          return address;
        }
      }
      // Stale session (expired or wrong network) — clean it up.
      this._session = null;
      await this._persistSession(null);
    }

    // No usable session → start a fresh pairing flow.
    const { uri, approval } = await client.connect({
      requiredNamespaces: {
        stellar: {
          methods: ["stellar_signXDR"],
          chains: [STELLAR_NETWORKS[this._network] ?? "stellar:testnet"],
          events: [],
        },
      },
    });
    this._onPairingUri(uri ?? null);

    let session: SessionTypes.Struct;
    try {
      session = await approval();
    } catch (err: unknown) {
      this._onPairingUri(null);
      throw new Error(
        err instanceof Error && err.message.includes("declined")
          ? "WalletConnect pairing was declined."
          : "WalletConnect pairing failed or timed out.",
      );
    }

    this._session = session;
    await this._persistSession(session);
    const address = this._extractStellarAccount(session);
    if (!address) {
      throw new Error(
        "WalletConnect session did not expose a Stellar account.",
      );
    }
    this._publicKey = address;
    return address;
  }

  async disconnect(): Promise<void> {
    const client = this._client;
    if (client && this._session) {
      try {
        await client.disconnect({
          topic: this._session.topic,
          reason: { code: 6000, message: "User disconnected" },
        });
      } catch {
        // Session may already be gone on the peer side; ignore.
      }
    }
    this._session = null;
    this._publicKey = null;
    await this._persistSession(null);
  }

  async signXdr(xdr: string): Promise<string> {
    const client = this._client;
    const session = this._session;
    if (!client || !session) {
      throw new Error("WalletConnect is not connected.");
    }

    const account = this._extractStellarAccount(session);
    if (!account) {
      throw new Error("WalletConnect session is missing a Stellar account.");
    }

    const result = await client.request<string>({
      topic: session.topic,
      chainId: STELLAR_NETWORKS[this._network] ?? "stellar:testnet",
      request: {
        method: "stellar_signXDR",
        params: { xdr, publicKey: account },
      },
    });
    if (!result) {
      throw new Error("WalletConnect returned an empty signature.");
    }
    return result;
  }

  /**
   * Expose the persisted session so the selector UI can show whether a
   * previous pairing is still around.
   */
  getSession(): SessionTypes.Struct | null {
    return this._session;
  }

  /** The Stellar public key from the active session, if connected. */
  getPublicKey(): string | null {
    return this._publicKey;
  }

  /**
   * Convenience factory so callers can treat every provider uniformly.
   */
  static async create(opts?: {
    network?: string;
    onPairingUri?: OnPairingUri;
  }): Promise<WalletConnectProvider> {
    return new WalletConnectProvider(opts);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async _getClient(): Promise<SignClient> {
    if (this._client) return this._client;
    const client = await SignClient.init({
      projectId: PROJECT_ID,
      metadata: {
        name: "Veritoken",
        description: "Veritoken RWA tokenization dashboard",
        url: window.location.origin,
        icons: ["/veritoken.svg"],
      },
    });
    // Re-register event handlers so expired sessions are dropped instead of
    // used later.
    client.on("session_expire", () => {
      this._session = null;
      this._publicKey = null;
      void this._persistSession(null);
    });
    client.on("session_delete", () => {
      this._session = null;
      this._publicKey = null;
      void this._persistSession(null);
    });
    this._client = client;
    return client;
  }

  private _loadSession(): Promise<SessionTypes.Struct | null> {
    if (typeof localStorage === "undefined") return Promise.resolve(null);
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return Promise.resolve(raw ? (JSON.parse(raw) as SessionTypes.Struct) : null);
    } catch {
      return Promise.resolve(null);
    }
  }

  private _persistSession(session: SessionTypes.Struct | null): Promise<void> {
    if (typeof localStorage === "undefined") return Promise.resolve();
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Storage may be unavailable (private mode); connection still works
      // for the lifetime of the page.
    }
    return Promise.resolve();
  }

  private _sessionMatchesNetwork(session: SessionTypes.Struct): boolean {
    const expected = STELLAR_NETWORKS[this._network] ?? "stellar:testnet";
    return Object.keys(session.namespaces).includes("stellar") &&
      (session.namespaces.stellar?.chains ?? []).includes(expected);
  }

  private _extractStellarAccount(session: SessionTypes.Struct): string | null {
    const accounts = session.namespaces.stellar?.accounts ?? [];
    if (accounts.length === 0) return null;
    // Accounts look like `stellar:testnet:G<address>` (CAIP-10 format).
    const full = accounts[0];
    const parts = full.split(":");
    // CAIP-10: namespace:reference:account_id
    // e.g. stellar:testnet:GABCDE12345...
    return parts.length >= 3 ? parts.slice(2).join(":") : parts[parts.length - 1] || null;
  }
}