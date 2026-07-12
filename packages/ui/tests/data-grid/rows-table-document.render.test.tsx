import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/rows-table.js";

const rowPage: RowPage = {
  columns: ["_id", "name"],
  rows: [{ _id: "507f1f77bcf86cd799439011", name: "Ada" }],
  page: 0,
  pageSize: 25
};

const columns: ColumnMetadata[] = [
  { name: "_id", dataType: "objectId", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "string", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

function baseProps(
  overrides: Partial<ComponentProps<typeof RowsTable>> = {}
): ComponentProps<typeof RowsTable> {
  return {
    rowPage,
    columns,
    page: 0,
    canGoPrevious: false,
    canGoNext: false,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    primaryKeyColumns: ["_id"],
    ...overrides
  };
}

describe("RowsTable MongoDB document actions (component rendering, F125)", () => {
  it("hides Insert document entirely when canInsertDocument is false", () => {
    render(<RowsTable {...baseProps({ canInsertDocument: false, onInsertDocument: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /insert document/i })).not.toBeInTheDocument();
  });

  it("hides Insert document when onInsertDocument is omitted, even if canInsertDocument is true", () => {
    render(<RowsTable {...baseProps({ canInsertDocument: true })} />);
    expect(screen.queryByRole("button", { name: /insert document/i })).not.toBeInTheDocument();
  });

  it("shows Insert document and calls the callback when clicked", () => {
    const onInsertDocument = vi.fn();
    render(<RowsTable {...baseProps({ canInsertDocument: true, onInsertDocument })} />);
    fireEvent.click(screen.getByRole("button", { name: /insert document/i }));
    expect(onInsertDocument).toHaveBeenCalledOnce();
  });

  it("hides the per-row Edit document action when canEditDocument is false", () => {
    render(<RowsTable {...baseProps({ canEditDocument: false, onEditDocument: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /edit document/i })).not.toBeInTheDocument();
  });

  it("shows the per-row Edit document action and calls the callback with that row's data", () => {
    const onEditDocument = vi.fn();
    render(<RowsTable {...baseProps({ canEditDocument: true, onEditDocument })} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit document 1" }));
    expect(onEditDocument).toHaveBeenCalledWith({ _id: "507f1f77bcf86cd799439011", name: "Ada" });
  });

  it("does not render the SQL Duplicate-row action alongside MongoDB's Edit-document action", () => {
    render(
      <RowsTable
        {...baseProps({
          canEditDocument: true,
          onEditDocument: vi.fn(),
          canInsert: true,
          insertableColumns: new Set(["_id", "name"]),
          pendingChanges: {
            getEdit: () => undefined,
            stageEdit: vi.fn(),
            revertEdit: vi.fn(),
            inserts: [],
            addInsert: vi.fn(),
            updateInsertValue: vi.fn(),
            removeInsert: vi.fn(),
            deletes: new Set(),
            stageDelete: vi.fn(),
            unstageDelete: vi.fn()
          }
        })}
      />
    );
    expect(screen.queryByRole("button", { name: /duplicate row/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit document 1" })).toBeInTheDocument();
  });
});
