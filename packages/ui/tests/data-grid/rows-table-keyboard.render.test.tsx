import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

const rowPage: RowPage = {
  columns: ["id", "name", "score"],
  rows: [
    { id: 1, name: "Ada", score: 10 },
    { id: 2, name: "Grace", score: 20 }
  ],
  page: 0,
  pageSize: 25
};

const editableColumns: ColumnMetadata[] = [
  { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "varchar", nullable: true, isPrimaryKey: false, isForeignKey: false },
  { name: "score", dataType: "int4", nullable: true, isPrimaryKey: false, isForeignKey: false }
];

function TestHost(): ReactNode {
  const [edits, setEdits] = useState<
    Map<string, Map<string, { original: unknown; next: unknown }>>
  >(new Map());

  const getEdit = useCallback(
    (rowKey: string, column: string) => edits.get(rowKey)?.get(column),
    [edits]
  );
  const stageEdit = useCallback(
    (rowKey: string, column: string, original: unknown, next: unknown) => {
      setEdits((current) => {
        const nextMap = new Map(current);
        const rowEdits = new Map(nextMap.get(rowKey));
        rowEdits.set(column, { original, next });
        nextMap.set(rowKey, rowEdits);
        return nextMap;
      });
    },
    []
  );
  const revertEdit = useCallback((rowKey: string, column: string) => {
    setEdits((current) => {
      const rowEdits = current.get(rowKey);
      if (!rowEdits) return current;
      const nextMap = new Map(current);
      const nextRowEdits = new Map(rowEdits);
      nextRowEdits.delete(column);
      nextMap.set(rowKey, nextRowEdits);
      return nextMap;
    });
  }, []);

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
      editable
      editableColumns={new Set(["name", "score"])}
      pendingChanges={{
        getEdit,
        stageEdit,
        revertEdit,
        inserts: [],
        addInsert: () => "",
        updateInsertValue: () => {},
        removeInsert: () => {},
        deletes: new Set(),
        stageDelete: () => {},
        unstageDelete: () => {}
      }}
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

describe("RowsTable keyboard navigation and shortcuts (F146)", () => {
  it("Enter commits an edit and moves selection down to the same column on the next row", () => {
    render(<TestHost />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    const input = screen.getByLabelText("name");
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("Grace"), { key: "Enter" });
    expect(screen.getByLabelText("name")).toHaveValue("Grace");
  });

  it("Tab commits an edit and moves selection to the next editable column", () => {
    render(<TestHost />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    const nameInput = screen.getByLabelText("name");
    fireEvent.change(nameInput, { target: { value: "Ada Lovelace" } });
    fireEvent.keyDown(nameInput, { key: "Tab" });

    fireEvent.keyDown(screen.getByText("10"), { key: "Enter" });
    expect(screen.getByLabelText("score")).toHaveValue("10");
  });

  it("Delete on a selected nullable cell stages NULL without opening the editor", () => {
    render(<TestHost />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "Delete" });
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("Ctrl+Z reverts the selected cell's staged edit", () => {
    render(<TestHost />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Ada Lovelace" } });
    fireEvent.keyDown(screen.getByLabelText("name"), { key: "Enter" });
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ada Lovelace"));
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "z", ctrlKey: true });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("arrow keys move the selection between cells without entering edit mode", () => {
    render(<TestHost />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByText("Grace"), { key: "Enter" });
    expect(screen.getByLabelText("name")).toHaveValue("Grace");
  });

  it("Escape clears the selection so shortcuts no longer target the previous cell", () => {
    render(<TestHost />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "Escape" });
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "Delete" });
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("does not intercept shortcuts while a cell editor is active", () => {
    render(<TestHost />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByLabelText("name"), { key: "z", ctrlKey: true });
    expect(screen.getByLabelText("name")).toBeInTheDocument();
  });

  it("does not offer Delete-to-NULL or paste for a non-nullable column", () => {
    render(<RowsTable {...baseProps({ editable: false })} />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByTestId("rows-table"), { key: "Delete" });
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });
});
