/**
 * Wallet selector modal (#545).
 *
 * Shown when no wallet is connected.  Displays a card for each wallet
 * provider that is available in the current environment (Freighter,
 * Ledger, WalletConnect), with a brief description and a connect button.
 *
 * The modal re-uses the app's existing glass-surface Card component and
 * gradient button styles so it feels native to the Veritoken design system.
 */

import { useEffect, useState } from "react";
import { useWallet } from "../lib/wallet";
import { createProvider } from "../lib/providers/index";
import type { WalletProviderType } from "../lib/walletProvider";
import { Card } from "./ui";

// ── Provider metadata ───────────────────────────────────────────────────

interface ProviderMeta {
  type: WalletProviderType;
  label: string;
  description: string;
  icon: string; // emoji / symbol
}

const ALL_PROVIDERS: ProviderMeta[] = [
  {
    type: "freighter",
    label: "Freighter",
    description: "Browser extension for Stellar",
    icon: "\u{1F4E6}",
  },
  {
    type: "ledger",
    label: "Ledger Nano",
    description: "Hardware wallet over USB",
    icon: "\u{1F50C}",
  },
  {
    type: "walletconnect",
    label: "WalletConnect",
    description: "Scan QR with mobile wallet",
    icon: "\u{1F4F1}",
  },
];

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    background: "rgba(0, 0, 0, 0.55)",
    backdropFilter: "blur(4px)",
  },
  modal: {
    width: "100%",
    maxWidth: 480,
    margin: "1rem",
  },
  cardGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  providerCard: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "1rem",
    borderRadius: 12,
    background: "var(--surface-2, rgba(255,255,255,0.05))",
    border: "1px solid var(--border, rgba(255,255,255,0.08))",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  providerCardHover: {
    borderColor: "var(--accent-2, #8b5cf6)",
    background: "var(--accent-soft, rgba(99,102,241,0.16))",
  },
  unavailable: {
    opacity: 0.4,
    cursor: "default",
  },
  iconBox: {
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    fontSize: "1.4rem",
    background: "var(--surface, rgba(255,255,255,0.025))",
    border: "1px solid var(--border, rgba(255,255,255,0.08))",
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "var(--text, #eef2f9)",
  },
  desc: {
    fontSize: "0.8rem",
    color: "var(--text-muted, #8b95ab)",
    marginTop: "0.15rem",
  },
  statusTag: {
    fontSize: "0.7rem",
    padding: "0.2rem 0.5rem",
    borderRadius: 6,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
  },
  tagAvailable: {
    background: "var(--success-soft, rgba(52, 211, 153, 0.14))",
    color: "var(--success, #34d399)",
  },
  tagUnavailable: {
    background: "rgba(239, 68, 68, 0.12)",
    color: "#ef4444",
  },
  error: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    borderRadius: 8,
    background: "rgba(239, 68, 68, 0.12)",
    color: "#f87171",
    fontSize: "0.8rem",
    lineHeight: 1.4,
  },
  footer: {
    marginTop: "0.75rem",
    textAlign: "center" as const,
    fontSize: "0.75rem",
    color: "var(--text-faint, #5b6577)",
  },
};

// ── Component ───────────────────────────────────────────────────────────

export default function WalletSelectorModal({ message }: { message?: string }) {
  const { connect, selectProvider, providerType, connected } = useWallet();
  const [avail, setAvail] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<WalletProviderType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Probe availability of each provider on mount (runs once per mount).
  useEffect(() => {
    const results: Record<string, boolean> = {};
    Promise.all(
      ALL_PROVIDERS.map(async (p) => {
        const provider = createProvider(p.type);
        try {
          results[p.type] = await provider.isAvailable();
        } catch {
          results[p.type] = false;
        }
      }),
    ).then(() => setAvail(results));
  }, []);

  // If already connected, render nothing (the guard handles the child).
  if (connected) return null;

  async function handleConnect(type: WalletProviderType) {
    setConnecting(type);
    setError(null);

    try {
      // If this is not the current provider type, switch first.
      if (type !== providerType) {
        await selectProvider(type);
      }
      await connect();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Connection failed. Try again.",
      );
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Select wallet">
      <div style={styles.modal}>
        <Card title="Connect Wallet" subtitle={message ?? "Choose how you want to connect to Stellar"}>
          <div style={styles.cardGrid}>
            {ALL_PROVIDERS.map((p) => {
              const isAvail = avail[p.type] ?? true; // assume available until probed
              const isConnecting = connecting === p.type;
              const isHovered = hovered === p.type && isAvail;

              return (
                <div
                  key={p.type}
                  role="button"
                  tabIndex={isAvail ? 0 : -1}
                  aria-label={`Connect with ${p.label}`}
                  aria-disabled={!isAvail || isConnecting}
                  style={{
                    ...styles.providerCard,
                    ...(isHovered ? styles.providerCardHover : {}),
                    ...(!isAvail ? styles.unavailable : {}),
                  }}
                  onClick={() => { if (isAvail && !isConnecting) handleConnect(p.type); }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && isAvail && !isConnecting) {
                      e.preventDefault();
                      handleConnect(p.type);
                    }
                  }}
                  onMouseEnter={() => setHovered(p.type)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div style={styles.iconBox}>{p.icon}</div>
                  <div style={styles.textBlock}>
                    <div style={styles.name}>
                      {p.label}
                      {isConnecting && (
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--accent-2)" }}>
                          Connecting…
                        </span>
                      )}
                    </div>
                    <div style={styles.desc}>{p.description}</div>
                  </div>
                  <span
                    style={{
                      ...styles.statusTag,
                      ...(isAvail ? styles.tagAvailable : styles.tagUnavailable),
                    }}
                  >
                    {isAvail ? "Available" : "Unavailable"}
                  </span>
                </div>
              );
            })}
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.footer}>
            <p>Your wallet address is never shared without your permission.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}