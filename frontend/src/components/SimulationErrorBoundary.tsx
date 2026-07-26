/**
 * SimulationErrorBoundary
 *
 * A specialised error boundary for pages that depend on Soroban contract
 * simulation / RPC calls.  It distinguishes between three failure classes:
 *
 *  1. Simulation / contract errors  – recoverable with a retry or navigation
 *     back to the dashboard.
 *  2. Network / connectivity errors – inform the user the RPC is unreachable.
 *  3. Unknown render errors         – generic fallback identical to the base
 *     ErrorBoundary, but with a dashboard escape-hatch.
 *
 * The boundary preserves all state of its children; only the fallback is
 * rendered when an error is caught.  Clicking "Try again" calls
 * `setState({ error: null })` which re-mounts the children without a full
 * page reload, so any in-progress wallet session is kept alive.
 */

import { Component, type ReactNode } from "react";
import { Card } from "./ui";

// ── helpers ──────────────────────────────────────────────────────────────────

type ErrorKind = "simulation" | "network" | "unknown";

function classifyError(err: Error): ErrorKind {
  const msg = err.message.toLowerCase();
  if (
    msg.includes("simulation") ||
    msg.includes("simulation failed") ||
    msg.includes("contract error") ||
    msg.includes("soroban") ||
    msg.includes("code=")
  ) {
    return "simulation";
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("econnrefused") ||
    msg.includes("timeout") ||
    msg.includes("unreachable")
  ) {
    return "network";
  }
  return "unknown";
}

// ── fallback copy per kind ────────────────────────────────────────────────────

const FALLBACK: Record<
  ErrorKind,
  { title: string; subtitle: string; retryLabel: string }
> = {
  simulation: {
    title: "Simulation failed",
    subtitle:
      "The contract call could not be simulated. This is usually caused by a " +
      "missing KYC approval, a compliance rule, or an invalid parameter. " +
      "Fix the input and try again — no transaction was submitted.",
    retryLabel: "Try again",
  },
  network: {
    title: "Network unreachable",
    subtitle:
      "Could not reach the Stellar RPC endpoint. Check your internet " +
      "connection or switch networks in the top-right selector, then retry.",
    retryLabel: "Retry",
  },
  unknown: {
    title: "Something went wrong",
    subtitle:
      "An unexpected error occurred while rendering this page. You can try " +
      "again below or return to the dashboard.",
    retryLabel: "Try again",
  },
};

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Wrapped page / section content. */
  children: ReactNode;
  /**
   * Optional callback invoked when the user clicks "Try again".
   * If provided it runs *before* the boundary clears the error so you can
   * reset local component state from the outside (e.g. refetch triggers).
   */
  onRetry?: () => void;
}

interface State {
  error: Error | null;
  kind: ErrorKind;
}

export default class SimulationErrorBoundary extends Component<Props, State> {
  state: State = { error: null, kind: "unknown" };

  static getDerivedStateFromError(error: Error): State {
    return { error, kind: classifyError(error) };
  }

  private handleRetry = () => {
    this.props.onRetry?.();
    this.setState({ error: null, kind: "unknown" });
  };

  render() {
    const { error, kind } = this.state;

    if (!error) {
      return this.props.children;
    }

    const { title, subtitle, retryLabel } = FALLBACK[kind];

    return (
      <div
        role="alert"
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "3rem",
          padding: "0 1rem",
        }}
      >
        <Card style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
          {/* Icon */}
          <div
            style={{
              fontSize: "2rem",
              marginBottom: "0.75rem",
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            {kind === "simulation" ? "⚡" : kind === "network" ? "🌐" : "⚠️"}
          </div>

          {/* Title */}
          <p
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              marginBottom: "0.5rem",
            }}
          >
            {title}
          </p>

          {/* Subtitle */}
          <p
            className="muted"
            style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}
          >
            {subtitle}
          </p>

          {/* Raw error message (collapsed) */}
          <details style={{ marginBottom: "1.25rem", textAlign: "left" }}>
            <summary
              className="muted"
              style={{
                fontSize: "0.8rem",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              Error details
            </summary>
            <pre
              style={{
                fontSize: "0.75rem",
                marginTop: "0.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--muted, #8b8fa8)",
                background: "var(--surface-2, #22253a)",
                padding: "0.6rem 0.75rem",
                borderRadius: 6,
              }}
            >
              {error.message}
            </pre>
          </details>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="btn-block"
              onClick={this.handleRetry}
              style={{ flex: 1 }}
            >
              {retryLabel}
            </button>
            <a
              href="/"
              className="btn-block"
              style={{
                flex: 1,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.6rem 1rem",
                borderRadius: 8,
                background: "var(--surface-2, #22253a)",
                color: "var(--text, #e2e4ef)",
                fontWeight: 600,
                fontSize: "0.9rem",
                border: "1px solid var(--border, #2a2d3a)",
              }}
            >
              Dashboard
            </a>
          </div>
        </Card>
      </div>
    );
  }
}
