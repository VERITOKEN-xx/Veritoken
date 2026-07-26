/**
 * Wallet adapter abstraction layer (issue #382)
 *
 * Defines the common interface every wallet provider must implement so the
 * rest of the application can remain provider-agnostic.  Swapping in a new
 * wallet (or a fallback / read-only mode) only requires a new adapter — no
 * changes to pages or contract clients needed.
 */

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface WalletAdapter {
  /** Human-readable name shown in the UI. */
  readonly name: string;

  /** Returns true when the browser extension / provider is detectable. */
  isAvailable(): Promise<boolean>;

  /**
   * Request account access.
   * Resolves to the public key on success; throws a descriptive Error on
   * failure (extension missing, user rejected, etc.).
   */
  connect(): Promise<string>;

  /** Sign an XDR-encoded transaction envelope and return the signed XDR. */
  signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Freighter adapter (primary provider)
// ---------------------------------------------------------------------------

export class FreighterAdapter implements WalletAdapter {
  readonly name = "Freighter";

  async isAvailable(): Promise<boolean> {
    try {
      const { isConnected } = await import("@stellar/freighter-api");
      return isConnected();
    } catch {
      return false;
    }
  }

  async connect(): Promise<string> {
    const { isConnected, setAllowed, getPublicKey } = await import(
      "@stellar/freighter-api"
    );

    const available = await isConnected();
    if (!available) {
      throw new Error(
        "Freighter is not installed. Please install the Freighter browser extension and reload the page.",
      );
    }

    await setAllowed();
    const key = await getPublicKey();
    if (!key) {
      throw new Error(
        "Freighter did not return a public key. Make sure your wallet is unlocked.",
      );
    }
    return key;
  }

  async signTransaction(
    xdr: string,
    networkPassphrase: string,
  ): Promise<string> {
    const { signTransaction } = await import("@stellar/freighter-api");
    const result = await signTransaction(xdr, { networkPassphrase });
    if (!result) {
      throw new Error("Freighter returned an empty signed transaction.");
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Read-only / fallback adapter
//
// Provides a no-op adapter for environments where no wallet is available.
// The connect() call surfaces a clear message; signTransaction() always
// throws so callers handle the inability to sign gracefully.
// ---------------------------------------------------------------------------

export class FallbackAdapter implements WalletAdapter {
  readonly name = "No wallet";

  async isAvailable(): Promise<boolean> {
    return true; // always available as last-resort fallback
  }

  async connect(): Promise<string> {
    throw new Error(
      "No wallet extension detected. Install Freighter (https://www.freighter.app) to connect.",
    );
  }

  async signTransaction(_xdr: string, _networkPassphrase: string): Promise<string> {
    throw new Error(
      "Transaction signing is unavailable: no wallet is connected.",
    );
  }
}

// ---------------------------------------------------------------------------
// Adapter registry & selection
// ---------------------------------------------------------------------------

/** Priority-ordered list of adapters.  The first available adapter is used. */
const ADAPTERS: WalletAdapter[] = [new FreighterAdapter(), new FallbackAdapter()];

/**
 * Returns the highest-priority adapter whose `isAvailable()` resolves true.
 * Always returns at least the FallbackAdapter.
 */
export async function selectAdapter(): Promise<WalletAdapter> {
  for (const adapter of ADAPTERS) {
    if (await adapter.isAvailable()) {
      return adapter;
    }
  }
  return new FallbackAdapter();
}
