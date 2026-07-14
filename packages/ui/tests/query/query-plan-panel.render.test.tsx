import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryPlanPanel } from "../../src/query/query-plan-panel.js";

describe("QueryPlanPanel (F128)", () => {
  it("renders loading, empty, and error states", () => {
    const { rerender } = render(<QueryPlanPanel loading onRetry={vi.fn()} />);
    expect(screen.getByText("Generating query plan...")).toBeInTheDocument();

    rerender(
      <QueryPlanPanel
        loading={false}
        result={{ lines: [], classification: "read", analyzed: false }}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("The database returned no plan details.")).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(<QueryPlanPanel loading={false} error="planning failed" onRetry={onRetry} />);
    expect(screen.getByText("planning failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
