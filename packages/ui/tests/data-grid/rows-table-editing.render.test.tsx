import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/rows-table.js";

const rowPage: RowPage = {
  columns: ["id", "name"],
  rows: [{ id: 1, name: "Ada" }],
  page: 0,
  pageSize: 25
};

const editableColumns: ColumnMetadata[] = [
  { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

/** A minimal real-React-state pending-changes stand-in - mirrors `usePendingChanges` closely enough
 * (state lives in the component that renders `RowsTable`, so a stage/revert call triggers the same
 * kind of re-render the real hook's caller relies on) without importing apps/web's implementation,
 * which packages/ui can't depend on. */
function TestHost({
  editable,
  onStageEdit,
  onRevertEdit
}: {
  editable: boolean;
  onStageEdit?: (rowKey: string, column: string, original: unknown, next: unknown) => void;
  onRevertEdit?: (rowKey: string, column: string) => void;
}): ReactNode {
  const [edits, setEdits] = useState<Map<string, Map<string, { next: unknown }>>>(new Map());

  const getEdit = useCallback(
    (rowKey: string, column: string) => edits.get(rowKey)?.get(column),
    [edits]
  );
  const stageEdit = useCallback(
    (rowKey: string, column: string, original: unknown, next: unknown) => {
      onStageEdit?.(rowKey, column, original, next);
      setEdits((current) => {
        const nextMap = new Map(current);
        const rowEdits = new Map(nextMap.get(rowKey));
        rowEdits.set(column, { next });
        nextMap.set(rowKey, rowEdits);
        return nextMap;
      });
    },
    [onStageEdit]
  );
  const revertEdit = useCallback(
    (rowKey: string, column: string) => {
      onRevertEdit?.(rowKey, column);
      setEdits((current) => {
        const rowEdits = current.get(rowKey);
        if (!rowEdits) return current;
        const nextMap = new Map(current);
        const nextRowEdits = new Map(rowEdits);
        nextRowEdits.delete(column);
        nextMap.set(rowKey, nextRowEdits);
        return nextMap;
      });
    },
    [onRevertEdit]
  );

  return (
    <RowsTable
      rowPage={rowPage}
      columns={editableColumns}
      page={0}
      canGoPrevious={false}
      canGoNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      primaryKeyColumns={["id"]}
      editable={editable}
      editableColumns={new Set(["id", "name"])}
      pendingChanges={{ getEdit, stageEdit, revertEdit }}
    />
  );
}

function baseProps(
  overrides: Partial<ComponentProps<typeof RowsTable>> = {}
): ComponentProps<typeof RowsTable> {
  return {
    rowPage,
    columns: editableColumns,
    page: 0,
    canGoPrevious: false,
    canGoNext: false,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    primaryKeyColumns: ["id"],
    ...overrides
  };
}

describe("RowsTable inline cell editing (component rendering, F103)", () => {
  it("does not enable editing when editable is omitted, even with editableColumns set", () => {
    render(<RowsTable {...baseProps({ editableColumns: new Set(["name"]) })} />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
  });

  it("double-click on an editable, non-PK cell opens the editor and stages the edit on commit", () => {
    const onStageEdit = vi.fn();
    render(<TestHost editable onStageEdit={onStageEdit} />);

    fireEvent.doubleClick(screen.getByText("Ada"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onStageEdit).toHaveBeenCalledWith(expect.any(String), "name", "Ada", "Grace");
  });

  it("does not make the primary-key cell editable even when editable is true", () => {
    render(<TestHost editable />);
    // Two "1"s render: the row-number column and the id (PK) cell's value - the PK cell is the
    // second one in document order.
    const [, pkCell] = screen.getAllByText("1");
    fireEvent.doubleClick(pkCell as HTMLElement);
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
  });

  it("shows the staged value and a revert button for a dirty cell", () => {
    render(<TestHost editable />);

    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.change(screen.getByLabelText("Edit cell value"), { target: { value: "Grace" } });
    fireEvent.keyDown(screen.getByLabelText("Edit cell value"), { key: "Enter" });

    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getByLabelText("Revert cell to original value")).toBeInTheDocument();
  });

  it("clicking revert calls the buffer's revertEdit and the cell reverts to the original value", () => {
    const onRevertEdit = vi.fn();
    render(<TestHost editable onRevertEdit={onRevertEdit} />);

    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.change(screen.getByLabelText("Edit cell value"), { target: { value: "Grace" } });
    fireEvent.keyDown(screen.getByLabelText("Edit cell value"), { key: "Enter" });
    fireEvent.click(screen.getByLabelText("Revert cell to original value"));

    expect(onRevertEdit).toHaveBeenCalledWith(expect.any(String), "name");
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("shows a read-only badge with the disabled reason when editing is unavailable", () => {
    render(
      <RowsTable
        {...baseProps({ editable: false, editingDisabledReason: "Views are read-only." })}
      />
    );
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });

  it("shows no read-only badge when no reason is given", () => {
    render(<RowsTable {...baseProps({ editable: false })} />);
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
  });
});
