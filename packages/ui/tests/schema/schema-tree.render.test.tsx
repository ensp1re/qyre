import type { SchemaMetadata } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchemaTree } from "../../src/schema/navigation/schema-tree.js";

const schemas: SchemaMetadata[] = [{ name: "public", tables: ["users", "orders"] }];

describe("SchemaTree (component rendering, F055)", () => {
  it("renders every schema/table from the tree, collapsed to depth < 2 by default", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("shows a hint instead of the unfiltered tree for a 1-character query (F037)", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "u" } });
    expect(screen.getByText(/keep typing/i)).toBeInTheDocument();
    expect(screen.queryByText("users")).not.toBeInTheDocument();
  });

  it("filters to matching tables (and their ancestor path) for a 2+ character query", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "ord" } });
    expect(screen.getByText("public")).toBeInTheDocument(); // ancestor path stays visible
    // "orders" itself is split across a <mark> (matching "ord") and a plain-text sibling ("ers"),
    // so getByText("orders") can't match it as a single text node - assert on the row instead.
    expect(screen.getByRole("treeitem", { name: "orders" })).toBeInTheDocument();
    expect(screen.queryByText("users")).not.toBeInTheDocument();
  });

  it("shows 'no results' for a query that matches nothing", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "zzz" } });
    expect(screen.getByText("no results")).toBeInTheDocument();
  });

  it("calls onSelect with the schema/table when a table row is activated", () => {
    const onSelect = vi.fn();
    render(<SchemaTree schemas={schemas} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("orders"));
    expect(onSelect).toHaveBeenCalledWith("public", "orders");
  });

  it("moves through visible tree items with arrow keys", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    const schema = screen.getByRole("treeitem", { name: /public/ });
    schema.focus();
    fireEvent.keyDown(schema, { key: "ArrowDown" });
    expect(screen.getByRole("treeitem", { name: "users" })).toHaveFocus();
  });

  it("keeps long database identifiers available when compact rows truncate them", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    expect(screen.getByTitle("orders")).toBeInTheDocument();
  });

  it("does not apply role=tree when there are no rows to render (aria-required-children)", () => {
    // Regression: `role="tree"` requires a treeitem/group descendant. With zero schemas (the
    // disconnected/unconfigured screen the smoke test scans) this used to leave the nav's role
    // on a message-only div, which axe flags as a critical aria-required-children violation.
    render(<SchemaTree schemas={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No tables found.")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });
});

describe("SchemaTree schema management (F116)", () => {
  it("hides New schema and per-schema drop buttons when canManageSchemas is false", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} canManageSchemas={false} />);
    expect(screen.queryByRole("button", { name: "New schema" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drop schema public")).not.toBeInTheDocument();
  });

  it("shows New schema and calls onRequestCreateSchema when clicked", () => {
    const onRequestCreateSchema = vi.fn();
    render(
      <SchemaTree
        schemas={schemas}
        onSelect={vi.fn()}
        canManageSchemas
        onRequestCreateSchema={onRequestCreateSchema}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "New schema" }));
    expect(onRequestCreateSchema).toHaveBeenCalledOnce();
  });

  it("calls onRequestDropSchema for the clicked schema without toggling its expand state", () => {
    const onRequestDropSchema = vi.fn();
    render(
      <SchemaTree
        schemas={schemas}
        onSelect={vi.fn()}
        canManageSchemas
        onRequestDropSchema={onRequestDropSchema}
      />
    );
    fireEvent.click(screen.getByLabelText("Drop schema public"));
    expect(onRequestDropSchema).toHaveBeenCalledWith("public");
    // The schema was expanded by default (depth 0) and stays that way - the drop click didn't
    // also toggle collapse via the row's own activate() handler.
    expect(screen.getByText("users")).toBeInTheDocument();
  });
});
