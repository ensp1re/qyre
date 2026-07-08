import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryRunner } from "./query-runner.js";

const BASE_PROPS = {
  sql: "SELECT 1",
  onSqlChange: vi.fn(),
  onRun: vi.fn(),
  isRunning: false,
  onOpenHistory: vi.fn()
};

const RESULT = { columns: ["a"], rows: [{ a: 1 }], page: 0, pageSize: 25 };

describe("QueryRunner results panel resizing (F071)", () => {
  it("does not render a resize handle when there is no result yet", () => {
    render(<QueryRunner {...BASE_PROPS} resultsHeight={256} onResultsHeightChange={vi.fn()} />);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("does not render a resize handle when resultsHeight/onResultsHeightChange are omitted", () => {
    render(<QueryRunner {...BASE_PROPS} result={RESULT} />);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("renders a resize handle reflecting resultsHeight once a result exists", () => {
    render(
      <QueryRunner
        {...BASE_PROPS}
        result={RESULT}
        resultsHeight={300}
        onResultsHeightChange={vi.fn()}
      />
    );
    const handle = screen.getByRole("separator", { name: "Resize query results panel" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
  });

  it("calls onResultsHeightChange when the handle is dragged, inverted so dragging up grows the panel", () => {
    const onResultsHeightChange = vi.fn();
    render(
      <QueryRunner
        {...BASE_PROPS}
        result={RESULT}
        resultsHeight={300}
        onResultsHeightChange={onResultsHeightChange}
      />
    );
    const handle = screen.getByRole("separator", { name: "Resize query results panel" });
    fireEvent.pointerDown(handle, { clientY: 200 });
    fireEvent.pointerMove(window, { clientY: 160 });
    expect(onResultsHeightChange).toHaveBeenCalledWith(340);
  });

  it("does not render a resize handle when there is an error instead of a result", () => {
    render(
      <QueryRunner
        {...BASE_PROPS}
        result={RESULT}
        error="boom"
        resultsHeight={300}
        onResultsHeightChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
