import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

const rowPage: RowPage = {
  columns: ["id", "name"],
  rows: [{ id: 1, name: "Ada" }],
  page: 0,
  pageSize: 25
};

const columns: ColumnMetadata[] = [
  { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

/** Minimal stateful pending-changes stand-in; packages/ui cannot import apps/web. */
function TestHost({
  canInsert,
  insertableColumns = new Set(["id", "name"]),
  pageData = rowPage,
  columnMetadata = columns,
  engine,
  onAddInsert
}: {
  canInsert: boolean;
  insertableColumns?: ReadonlySet<string>;
  pageData?: RowPage;
  columnMetadata?: ColumnMetadata[];
  engine?: ComponentProps<typeof RowsTable>["engine"];
  onAddInsert?: (initialValues: Record<string, unknown> | undefined) => void;
}): ReactNode {
  const [inserts, setInserts] = useState<{ id: string; values: Record<string, unknown> }[]>([]);
  const nextId = useRef(0);

  const addInsert = useCallback(
    (initialValues?: Record<string, unknown>) => {
      onAddInsert?.(initialValues);
      const id = `insert-${nextId.current++}`;
      setInserts((current) => [...current, { id, values: initialValues ?? {} }]);
      return id;
    },
    [onAddInsert]
  );

  const updateInsertValue = useCallback((id: string, column: string, value: unknown) => {
    setInserts((current) =>
      current.map((insert) =>
        insert.id === id ? { ...insert, values: { ...insert.values, [column]: value } } : insert
      )
    );
  }, []);

  const removeInsert = useCallback((id: string) => {
    setInserts((current) => current.filter((insert) => insert.id !== id));
  }, []);

  return (
    <RowsTable
      rowPage={pageData}
      columns={columnMetadata}
      engine={engine}
      page={0}
      canGoPrevious={false}
      canGoNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      primaryKeyColumns={["id"]}
      canInsert={canInsert}
      insertableColumns={insertableColumns}
      pendingChanges={{
        getEdit: () => undefined,
        stageEdit: vi.fn(),
        revertEdit: vi.fn(),
        inserts,
        addInsert,
        updateInsertValue,
        removeInsert,
        deletes: new Set(),
        stageDelete: vi.fn(),
        unstageDelete: vi.fn()
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

describe("RowsTable Add-row / Duplicate-row (component rendering, F104)", () => {
  it("hides the Add row button entirely when canInsert is false", () => {
    render(<RowsTable {...baseProps({ canInsert: false })} />);
    expect(screen.queryByRole("button", { name: /add row/i })).not.toBeInTheDocument();
  });

  it("hides the Add row button when pendingChanges is omitted, even if canInsert is true", () => {
    render(<RowsTable {...baseProps({ canInsert: true })} />);
    expect(screen.queryByRole("button", { name: /add row/i })).not.toBeInTheDocument();
  });

  it("clicking Add row stages a blank draft row with an editor trigger per insertable column", () => {
    render(<TestHost canInsert />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    expect(screen.getByRole("button", { name: "Set id" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set name" })).toBeInTheDocument();
  });

  it("typing into a draft cell and applying stages that column's value", () => {
    render(<TestHost canInsert />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    fireEvent.click(screen.getByRole("button", { name: "Set name" }));
    const nameInput = screen.getByLabelText("name");
    fireEvent.change(nameInput as HTMLElement, { target: { value: "Grace" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveTextContent("Grace");
  });

  it("discarding a draft row removes its inputs", () => {
    render(<TestHost canInsert />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    expect(screen.getByRole("button", { name: "Set id" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set name" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard new row" }));
    expect(screen.queryByRole("button", { name: "Set id" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set name" })).not.toBeInTheDocument();
  });

  it("Duplicate row pre-fills a new draft from the source row, excluding the primary key", () => {
    render(<TestHost canInsert />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate row 1" }));
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveTextContent("Ada");
    expect(screen.getByRole("button", { name: "Set id" })).toBeInTheDocument();
  });

  it("normalizes duplicated bytea values to hexadecimal text before staging", () => {
    const onAddInsert = vi.fn();
    render(
      <TestHost
        canInsert
        engine="postgres"
        pageData={{
          columns: ["id", "bytea_value"],
          rows: [{ id: 1, bytea_value: { type: "Buffer", data: [0, 202, 254] } }],
          page: 0,
          pageSize: 25
        }}
        columnMetadata={[
          {
            name: "id",
            dataType: "int4",
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: false
          },
          {
            name: "bytea_value",
            dataType: "bytea",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]}
        insertableColumns={new Set(["id", "bytea_value"])}
        onAddInsert={onAddInsert}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicate row 1" }));
    expect(onAddInsert).toHaveBeenCalledWith({ bytea_value: "00cafe" });
  });

  it("hides the Duplicate row action when canInsert is false", () => {
    render(<RowsTable {...baseProps({ canInsert: false })} />);
    expect(screen.queryByRole("button", { name: /duplicate row/i })).not.toBeInTheDocument();
  });

  it("does not render an input for a non-insertable column on a draft row", () => {
    render(<TestHost canInsert insertableColumns={new Set(["id"])} />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    expect(screen.getByRole("button", { name: "Set id" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set name" })).not.toBeInTheDocument();
  });
});
