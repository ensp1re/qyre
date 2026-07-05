import type { SchemaMetadata } from "@humbdb/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchemaTree } from "./schema-tree.js";

const schemas: SchemaMetadata[] = [{ name: "public", tables: ["users", "orders"] }];

describe("SchemaTree (component rendering, F055)", () => {
  it("renders every schema/table from the tree, collapsed to depth < 2 by default", () => {
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("shows a hint instead of the unfiltered tree for a 1-character query (F037)", () => {
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "u" } });
    expect(screen.getByText(/keep typing/i)).toBeInTheDocument();
    expect(screen.queryByText("users")).not.toBeInTheDocument();
  });

  it("filters to matching tables (and their ancestor path) for a 2+ character query", () => {
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "ord" } });
    expect(screen.getByText("public")).toBeInTheDocument(); // ancestor path stays visible
    // "orders" itself is split across a <mark> (matching "ord") and a plain-text sibling ("ers"),
    // so getByText("orders") can't match it as a single text node - assert on the row instead.
    expect(screen.getByRole("treeitem", { name: "orders" })).toBeInTheDocument();
    expect(screen.queryByText("users")).not.toBeInTheDocument();
  });

  it("shows 'no results' for a query that matches nothing", () => {
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "zzz" } });
    expect(screen.getByText("no results")).toBeInTheDocument();
  });

  it("calls onSelect with the schema/table when a table row is activated", () => {
    const onSelect = vi.fn();
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("orders"));
    expect(onSelect).toHaveBeenCalledWith("public", "orders");
  });

  it("gives the connection status a distinct accessible label, not just a color (F038)", () => {
    render(
      <SchemaTree
        target="postgres://localhost/db"
        status="connected"
        schemas={schemas}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Connection status: Connected")).toBeInTheDocument();
  });
});
