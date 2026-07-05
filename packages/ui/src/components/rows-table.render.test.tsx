import type { ColumnMetadata, RowPage } from "@humbdb/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "./rows-table.js";

const rowPage: RowPage = {
  columns: ["id", "name"],
  rows: [
    { id: 3, name: "Charlie" },
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" }
  ],
  page: 0,
  pageSize: 25
};

function renderTable(props: Partial<ComponentProps<typeof RowsTable>> = {}) {
  return render(
    <RowsTable
      rowPage={rowPage}
      page={0}
      canGoPrevious={false}
      canGoNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      {...props}
    />
  );
}

describe("RowsTable server-side sort (component rendering, F065)", () => {
  it("renders rows in whatever order rowPage provides, unsorted by default", () => {
    renderTable();
    const cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("does not reorder rows itself even when a sort is already active via props", () => {
    // Rows are expected to already arrive sorted from the server (F065) - RowsTable must not
    // additionally reorder them client-side, unlike the old F055 client-side sort behavior.
    renderTable({ sortColumn: "name", sortDirection: "asc" });
    const cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("cycles asc -> desc -> cleared as a controlled parent re-renders with each reported sort", () => {
    // RowsTable is a controlled component here (F065) - it has no local sort state of its own, so
    // the cycle only advances when the parent actually re-renders with the sortColumn/
    // sortDirection onSortChange just reported, exactly as apps/web's App.tsx does.
    const onSortChange = vi.fn();
    const baseProps: ComponentProps<typeof RowsTable> = {
      rowPage,
      page: 0,
      canGoPrevious: false,
      canGoNext: false,
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onSortChange
    };
    const { rerender } = render(<RowsTable {...baseProps} />);

    fireEvent.click(screen.getByText("name"));
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "name", direction: "asc" });

    rerender(<RowsTable {...baseProps} sortColumn="name" sortDirection="asc" />);
    fireEvent.click(screen.getByText("name"));
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "name", direction: "desc" });

    rerender(<RowsTable {...baseProps} sortColumn="name" sortDirection="desc" />);
    fireEvent.click(screen.getByText("name"));
    expect(onSortChange).toHaveBeenLastCalledWith(undefined);
  });

  it("renders headers as non-interactive (no cursor-pointer class, no arrow icon) when onSortChange is omitted", () => {
    renderTable();
    const nameHeader = screen.getByText("name").closest("th");
    expect(nameHeader?.className).not.toContain("cursor-pointer");
  });

  it("filters rows by the search box, case-insensitively", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Filter this page"), { target: { value: "ali" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });
});

describe("RowsTable whole-table export (component rendering, F066)", () => {
  it("shows the export button and calls onExportAllRows when clicked", () => {
    const onExportAllRows = vi.fn();
    renderTable({ onExportAllRows });
    fireEvent.click(screen.getByLabelText("Export all rows as CSV"));
    expect(onExportAllRows).toHaveBeenCalledOnce();
  });

  it("hides the export button when onExportAllRows is omitted", () => {
    renderTable();
    expect(screen.queryByLabelText("Export all rows as CSV")).not.toBeInTheDocument();
  });
});

describe("RowsTable foreign key navigation (component rendering, F061)", () => {
  const fkColumns: ColumnMetadata[] = [
    { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
    {
      name: "name",
      dataType: "text",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: true,
      references: { table: "users", column: "id" }
    }
  ];

  it("renders a foreign key cell as a clickable link when onNavigateToForeignKey is provided", () => {
    const onNavigateToForeignKey = vi.fn();
    render(
      <RowsTable
        rowPage={rowPage}
        columns={fkColumns}
        page={0}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onNavigateToForeignKey={onNavigateToForeignKey}
      />
    );

    expect(screen.getByText("FK")).toBeInTheDocument();

    const [firstLink] = screen.getAllByTitle("Go to users.id");
    expect(firstLink).toBeDefined();
    fireEvent.click(firstLink as HTMLElement);
    expect(onNavigateToForeignKey).toHaveBeenCalledWith({ table: "users", column: "id" });
  });

  it("renders a foreign key cell as plain text when onNavigateToForeignKey is omitted", () => {
    render(
      <RowsTable
        rowPage={rowPage}
        columns={fkColumns}
        page={0}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.queryByTitle("Go to users.id")).not.toBeInTheDocument();
  });
});
