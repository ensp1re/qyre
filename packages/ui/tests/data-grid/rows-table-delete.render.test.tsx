import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

const rowPage: RowPage = {
  columns: ["id", "name"],
  rows: [
    { id: 1, name: "Ada" },
    { id: 2, name: "Alan" }
  ],
  page: 0,
  pageSize: 25
};

const columns: ColumnMetadata[] = [
  { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

/** A minimal real-React-state pending-changes stand-in exercising the delete half of the buffer. */
function TestHost({ canDelete, editable }: { canDelete: boolean; editable?: boolean }): ReactNode {
  const [deletes, setDeletes] = useState<Set<string>>(new Set());

  const stageDelete = useCallback((rowKey: string) => {
    setDeletes((current) => new Set(current).add(rowKey));
  }, []);

  const unstageDelete = useCallback((rowKey: string) => {
    setDeletes((current) => {
      const next = new Set(current);
      next.delete(rowKey);
      return next;
    });
  }, []);

  return (
    <RowsTable
      rowPage={rowPage}
      columns={columns}
      page={0}
      canGoPrevious={false}
      canGoNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      primaryKeyColumns={["id"]}
      canDelete={canDelete}
      editable={editable}
      editableColumns={new Set(["name"])}
      pendingChanges={{
        getEdit: () => undefined,
        stageEdit: vi.fn(),
        revertEdit: vi.fn(),
        inserts: [],
        addInsert: () => "",
        updateInsertValue: vi.fn(),
        removeInsert: vi.fn(),
        deletes,
        stageDelete,
        unstageDelete
      }}
    />
  );
}

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
    primaryKeyColumns: ["id"],
    ...overrides
  };
}

describe("RowsTable delete staging (component rendering, F105)", () => {
  it("hides the delete action entirely when canDelete is false, even with rows selected", () => {
    render(<RowsTable {...baseProps({ canDelete: false })} />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    expect(screen.queryByRole("button", { name: /delete.*selected/i })).not.toBeInTheDocument();
  });

  it("hides the delete action when pendingChanges is omitted, even if canDelete is true", () => {
    render(<RowsTable {...baseProps({ canDelete: true })} />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    expect(screen.queryByRole("button", { name: /delete.*selected/i })).not.toBeInTheDocument();
  });

  it("selecting rows and clicking Delete stages them, marking the row struck through", () => {
    render(<TestHost canDelete />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(screen.getByLabelText("Undo delete row 1")).toBeInTheDocument();
  });

  it("clears the selection after staging for delete", () => {
    render(<TestHost canDelete />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("disables the checkbox for a row staged for deletion", () => {
    render(<TestHost canDelete />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(screen.getByLabelText("Select row 1")).toBeDisabled();
  });

  it("does not make a cell editable on a row staged for deletion", () => {
    render(<TestHost canDelete editable />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected" }));
    fireEvent.click(screen.getByText("Ada"));
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
  });

  it("clicking Undo un-stages the row's deletion", () => {
    render(<TestHost canDelete />);
    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected" }));
    fireEvent.click(screen.getByLabelText("Undo delete row 1"));
    expect(screen.queryByLabelText("Undo delete row 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select row 1")).not.toBeDisabled();
  });
});
