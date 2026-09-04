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

  it("uses one composite focus surface for explorer search", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Search tables").parentElement).toHaveAttribute(
      "data-focus-surface"
    );
  });

  it("filters to matching tables (and their ancestor path) for a 2+ character query", () => {
    render(<SchemaTree schemas={schemas} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search tables"), { target: { value: "ord" } });
    expect(screen.getByText("public")).toBeInTheDocument();
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
    expect(screen.getByText("users")).toBeInTheDocument();
  });
});
