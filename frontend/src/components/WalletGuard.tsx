/**
 * WalletGuard — wraps protected pages with a wallet-connect prompt.
 *
 * Enhanced for issue #381 (resilience):
 *   - Surfaces connectionError with a clear message instead of swallowing it
 *   - Provides a Retry button to re-attempt connection
 *   - Shows a loading state while the adapter is working
 */
import type { ReactNode } from "react";
import { useWallet } from "../lib/wallet";
import { Card } from "./ui";

export default function WalletGuard({ children }: { children: ReactNode }) {
  const { connected, connect, connectionError, loading, clearError } =
    useWallet();

  if (connected) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: "3rem" }}>
      <Card style={{ textAlign: "center", maxWidth: 400 }}>
        {/* Icon */}
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔐</div>

        <p
          style={{
            marginBottom: connectionError ? "0.75rem" : "1.25rem",
            fontSize: "0.95rem",
            color: "var(--text)",
          }}
        >
          Connect your Freighter wallet to continue
        </p>

        {/* Error banner */}
        {connectionError && (
          <div
            role="alert"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-sm)",
              color: "var(--danger)",
              fontSize: "0.82rem",
              padding: "0.65rem 0.85rem",
              marginBottom: "1.1rem",
              textAlign: "left",
              lineHeight: 1.5,
            }}
          >
            {connectionError}
          </div>
        )}

        {/* Primary action */}
        <button
          className="btn-block"
          disabled={loading}
          onClick={() => {
            clearError();
            connect();
          }}
          style={{ marginBottom: connectionError ? "0.6rem" : 0 }}
        >
          {loading ? "Connecting…" : connectionError ? "Retry" : "Connect Wallet"}
        </button>

        {/* Help text for missing extension */}
        {connectionError &&
          connectionError.toLowerCase().includes("not installed") && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                marginTop: "0.6rem",
              }}
            >
              Need Freighter?{" "}
              <a
                href="https://www.freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                Download it here
              </a>
            </p>
          )}
      </Card>
    </div>
  );
}
