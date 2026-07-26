/**
 * ThemeToggle — a compact dark/light/system selector for the navigation bar.
 * Resolves issue #380 (Dark and Light Theme Support with Brand Refinement).
 */
import { useTheme, useThemeStore, type Theme } from "../lib/theme";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "💻" },
];

export default function ThemeToggle() {
  const [, setTheme] = useTheme();
  const { theme } = useThemeStore();

  return (
    <div
      role="group"
      aria-label="Theme selector"
      style={{
        display: "inline-flex",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        padding: "0.18rem",
        gap: "0.1rem",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            title={opt.label}
            style={{
              background: active ? "var(--accent-soft)" : "transparent",
              color: active ? "var(--accent-2)" : "var(--text-faint)",
              border: "none",
              borderRadius: "999px",
              padding: "0.28rem 0.55rem",
              fontSize: "0.78rem",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
              boxShadow: "none",
            }}
          >
            <span aria-hidden="true" style={{ marginRight: "0.25rem" }}>
              {opt.icon}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
