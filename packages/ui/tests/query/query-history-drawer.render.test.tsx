import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryHistoryDrawer } from "../../src/query/query-history-drawer.js";

describe("QueryHistoryDrawer classification badge (F108)", () => {
  it("shows a classification badge for a non-read entry", () => {
    render(
      <QueryHistoryDrawer
        open
        onOpenChange={vi.fn()}
        entries={[
          { sql: "DELETE FROM users WHERE id = 1", ranAt: Date.now(), classification: "mutation" }
        ]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByTestId("query-history-classification")).toHaveTextContent("mutation");
  });

  it("hides the badge for a read entry", () => {
    render(
      <QueryHistoryDrawer
        open
        onOpenChange={vi.fn()}
        entries={[{ sql: "SELECT 1", ranAt: Date.now(), classification: "read" }]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByTestId("query-history-classification")).not.toBeInTheDocument();
  });

  it("hides the badge when classification is absent (a read-only session's entry)", () => {
    render(
      <QueryHistoryDrawer
        open
        onOpenChange={vi.fn()}
        entries={[{ sql: "SELECT 1", ranAt: Date.now() }]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByTestId("query-history-classification")).not.toBeInTheDocument();
  });
});
