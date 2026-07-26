/**
 * Integration test harness: SimulationErrorBoundary fallback UI
 *
 * Tests validate that:
 *  ✓ Children render normally when no error occurs
 *  ✓ Simulation errors show the "Simulation failed" fallback
 *  ✓ Network errors show the "Network unreachable" fallback
 *  ✓ Unknown errors show the generic "Something went wrong" fallback
 *  ✓ The "Try again" button clears the error and re-renders children
 *  ✓ The "Dashboard" escape-hatch link is always rendered on error
 *  ✓ The raw error message is available in the details element
 *  ✓ onRetry callback is called before the boundary resets
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SimulationErrorBoundary from "../../components/SimulationErrorBoundary";

// ── helpers ───────────────────────────────────────────────────────────────────

/** A child component that throws the given error on first render. */
function BombChild({ error }: { error: Error }): never {
  throw error;
}

/** A stable child component that renders a known text node. */
function StableChild() {
  return <div data-testid="child">OK</div>;
}

/** Suppress React's console.error noise for expected error boundary throws. */
function silenceConsoleError() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => spy.mockRestore();
}

function renderWithBoundary(ui: React.ReactNode, onRetry?: () => void) {
  return render(
    <MemoryRouter>
      <SimulationErrorBoundary onRetry={onRetry}>{ui}</SimulationErrorBoundary>
    </MemoryRouter>,
  );
}

// ── no-error path ─────────────────────────────────────────────────────────────

describe("SimulationErrorBoundary – no error", () => {
  it("renders children normally when no error is thrown", () => {
    renderWithBoundary(<StableChild />);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("does not show fallback UI when children succeed", () => {
    renderWithBoundary(<StableChild />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── simulation error ──────────────────────────────────────────────────────────

describe("SimulationErrorBoundary – simulation error", () => {
  it("shows 'Simulation failed' title for simulation errors", () => {
    const restore = silenceConsoleError();
    renderWithBoundary(
      <BombChild error={new Error("Simulation failed: code=3")} />,
    );
    restore();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // The title paragraph specifically matches "Simulation failed" (not the error details)
    const matches = screen.getAllByText(/Simulation failed/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // At least one match must be the title paragraph (font-weight 700)
    const titleEl = matches.find(
      (el) => el.tagName === "P" && el.style.fontWeight === "700",
    );
    expect(titleEl).toBeInTheDocument();
  });

  it("includes the raw error message in the details element", () => {
    const restore = silenceConsoleError();
    renderWithBoundary(
      <BombChild error={new Error("Simulation failed: ContractError (code=2)")} />,
    );
    restore();
    expect(screen.getByText(/ContractError/)).toBeInTheDocument();
  });

  it("shows the Dashboard link", () => {
    const restore = silenceConsoleError();
    renderWithBoundary(
      <BombChild error={new Error("simulation error occurred")} />,
    );
    restore();
    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toBeInTheDocument();
  });
});

// ── network error ─────────────────────────────────────────────────────────────

describe("SimulationErrorBoundary – network error", () => {
  it("shows 'Network unreachable' title for network errors", () => {
    const restore = silenceConsoleError();
    renderWithBoundary(
      <BombChild error={new Error("fetch failed: network timeout")} />,
    );
    restore();
    expect(screen.getByText(/Network unreachable/i)).toBeInTheDocument();
  });
});

// ── unknown error ─────────────────────────────────────────────────────────────

describe("SimulationErrorBoundary – unknown error", () => {
  it("shows generic fallback for unknown errors", () => {
    const restore = silenceConsoleError();
    renderWithBoundary(<BombChild error={new Error("unexpected render crash")} />);
    restore();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});

// ── retry behaviour ───────────────────────────────────────────────────────────

describe("SimulationErrorBoundary – retry", () => {
  it("clears the error and re-renders children when 'Try again' is clicked", () => {
    const restore = silenceConsoleError();

    // We need a component whose error can be turned off from the outside.
    let shouldThrow = true;

    function ConditionalBomb() {
      if (shouldThrow) throw new Error("simulation error: initial failure");
      return <div data-testid="recovered">Recovered</div>;
    }

    const { rerender } = renderWithBoundary(<ConditionalBomb />);
    restore();

    // Fallback is visible
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Stop the child from throwing, then click retry
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    // Re-render with the non-throwing child
    rerender(
      <MemoryRouter>
        <SimulationErrorBoundary>
          <ConditionalBomb />
        </SimulationErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onRetry callback when provided", () => {
    const restore = silenceConsoleError();
    const onRetry = vi.fn();

    renderWithBoundary(
      <BombChild error={new Error("simulation error")} />,
      onRetry,
    );
    restore();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
