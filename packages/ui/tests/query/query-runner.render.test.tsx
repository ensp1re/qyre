import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryRunner } from "../../src/query/query-runner.js";

const BASE_PROPS = {
  sql: "SELECT 1",
  onSqlChange: vi.fn(),
  onRun: vi.fn(),
  onCancel: vi.fn(),
  isRunning: false,
  onExplain: vi.fn(),
  isExplaining: false,
  onOpenHistory: vi.fn()
};

const RESULT = { columns: ["a"], rows: [{ a: 1 }], page: 0, pageSize: 25 };

describe("QueryRunner results panel resizing (F071)", () => {
  it("does not render a resize handle when there is no result yet", () => {
    render(<QueryRunner {...BASE_PROPS} resultsHeight={256} onResultsHeightChange={vi.fn()} />);
    expect(
      screen.queryByRole("separator", { name: "Resize query results panel" })
    ).not.toBeInTheDocument();
  });

  it("does not render a resize handle when resultsHeight/onResultsHeightChange are omitted", () => {
    render(<QueryRunner {...BASE_PROPS} result={RESULT} />);
    expect(
      screen.queryByRole("separator", { name: "Resize query results panel" })
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("separator", { name: "Resize query results panel" })
    ).not.toBeInTheDocument();
  });
});

describe("QueryRunner write-capable result rendering (F108)", () => {
  it("renders an affected-row count for a rowless QueryExecutionResult", () => {
    render(<QueryRunner {...BASE_PROPS} result={{ columns: [], rows: [], rowsAffected: 3 }} />);
    expect(screen.getByText("3 rows affected.")).toBeInTheDocument();
  });

  it("uses singular phrasing for exactly one affected row", () => {
    render(<QueryRunner {...BASE_PROPS} result={{ columns: [], rows: [], rowsAffected: 1 }} />);
    expect(screen.getByText("1 row affected.")).toBeInTheDocument();
  });

  it("still renders 'Query returned no rows.' for an empty RowPage (no rowsAffected field)", () => {
    render(
      <QueryRunner {...BASE_PROPS} result={{ columns: [], rows: [], page: 0, pageSize: 25 }} />
    );
    expect(screen.getByText("Query returned no rows.")).toBeInTheDocument();
  });

  it("renders the row table (not an affected-row message) when a QueryExecutionResult has rows", () => {
    render(
      <QueryRunner {...BASE_PROPS} result={{ columns: ["a"], rows: [{ a: 1 }], rowsAffected: 1 }} />
    );
    expect(screen.queryByText(/row.*affected/)).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
  });

  it("offers CSV and JSON downloads only when query rows exist", () => {
    const onExportResults = vi.fn();
    const { rerender } = render(
      <QueryRunner {...BASE_PROPS} result={RESULT} onExportResults={onExportResults} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Export query results as CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Export query results as JSON" }));
    expect(onExportResults).toHaveBeenNthCalledWith(1, "csv");
    expect(onExportResults).toHaveBeenNthCalledWith(2, "json");

    rerender(
      <QueryRunner
        {...BASE_PROPS}
        result={{ columns: [], rows: [], page: 0, pageSize: 25 }}
        onExportResults={onExportResults}
      />
    );
    expect(screen.queryByRole("toolbar", { name: "Query result actions" })).not.toBeInTheDocument();
  });
});

describe("QueryRunner long result inspection", () => {
  it("opens a read-only full-value drawer on double-click", () => {
    const value = "long query result ".repeat(20);
    render(
      <QueryRunner
        {...BASE_PROPS}
        result={{ columns: ["body"], rows: [{ body: value }], page: 0, pageSize: 25 }}
      />
    );

    fireEvent.doubleClick(screen.getByTitle("Double-click to inspect the full value"));
    expect(screen.getByTestId("cell-value-drawer")).toHaveTextContent("Cell Value");
    expect(screen.getByTestId("cell-value-drawer")).toHaveTextContent(value.trim());
  });
});

describe("QueryRunner Cancel button (F126)", () => {
  it("does not render a Cancel button while idle", () => {
    render(<QueryRunner {...BASE_PROPS} isRunning={false} />);
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  it("renders a Cancel button while running and calls onCancel when clicked", () => {
    const onCancel = vi.fn();
    render(<QueryRunner {...BASE_PROPS} isRunning onCancel={onCancel} />);
    const button = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(button);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("QueryRunner query plans (F128)", () => {
  it("temporarily hides the Explain command while retaining plan rendering support", () => {
    render(<QueryRunner {...BASE_PROPS} />);
    expect(screen.queryByRole("button", { name: "Explain" })).not.toBeInTheDocument();
  });

  it("does not offer ANALYZE in the SQL Editor", () => {
    render(<QueryRunner {...BASE_PROPS} engine="postgres" />);
    expect(screen.queryByRole("checkbox", { name: /ANALYZE/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Analyze")).not.toBeInTheDocument();
  });

  it("renders a normalized plan in the resizable output panel", () => {
    render(
      <QueryRunner
        {...BASE_PROPS}
        explainResult={{
          lines: ["Seq Scan on users", "  Filter: active"],
          classification: "read",
          analyzed: true
        }}
        resultsHeight={300}
        onResultsHeightChange={vi.fn()}
      />
    );
    expect(screen.getByTestId("query-plan")).toHaveTextContent("Seq Scan on users");
    expect(screen.getByText("analyzed")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize query plan panel" })).toHaveAttribute(
      "aria-valuenow",
      "300"
    );
  });

  it("keeps results and a query plan available as docked output tabs", () => {
    render(
      <QueryRunner
        {...BASE_PROPS}
        result={RESULT}
        explainResult={{ lines: ["Result"], classification: "read", analyzed: false }}
      />
    );

    const planTab = screen.getByRole("tab", { name: "Plan" });
    expect(planTab).toHaveAttribute("aria-selected", "true");
    planTab.focus();
    fireEvent.keyDown(planTab, { key: "ArrowLeft" });
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
  });
});
