import type { TableMetadata } from "@qyre/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableDetail } from "../../src/schema/structure/table-detail.js";

function makeTable(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    schema: "public",
    name: "users",
    kind: "table",
    columns: [],
    ...overrides
  };
}

describe("TableDetail kind badge (F124)", () => {
  it("shows no badge for an ordinary table", () => {
    render(<TableDetail table={makeTable({ kind: "table" })} />);
    expect(screen.queryByTestId("table-kind-badge")).not.toBeInTheDocument();
  });

  it("shows no badge for a MongoDB collection", () => {
    render(<TableDetail table={makeTable({ kind: "collection" })} />);
    expect(screen.queryByTestId("table-kind-badge")).not.toBeInTheDocument();
  });

  it("shows a VIEW badge for a view", () => {
    render(<TableDetail table={makeTable({ kind: "view" })} />);
    expect(screen.getByTestId("table-kind-badge")).toHaveTextContent("VIEW");
  });

  it("shows a MATERIALIZED VIEW badge for a materialized view", () => {
    render(<TableDetail table={makeTable({ kind: "materialized-view" })} />);
    expect(screen.getByTestId("table-kind-badge")).toHaveTextContent("MATERIALIZED VIEW");
  });
});
