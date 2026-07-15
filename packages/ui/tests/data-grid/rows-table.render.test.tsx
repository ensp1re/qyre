import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

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
    fireEvent.change(screen.getByLabelText("Search this page"), { target: { value: "ali" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });
});

describe("RowsTable header type badges (component rendering, F081)", () => {
  it("renders each column's type badge inside its header cell, not a separate bar", () => {
    const columns: ColumnMetadata[] = [
      { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
      {
        name: "name",
        dataType: "timestamp without time zone",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      }
    ];
    renderTable({ columns });

    const nameHeader = screen.getByText("name").closest("th");
    expect(nameHeader).toHaveTextContent("timestamp");
    expect(nameHeader).not.toHaveTextContent("timestamp without time zone");
  });
});

describe("RowsTable whole-result export (component rendering, F118)", () => {
  it("shows the export button and calls onExportAllRows when clicked", () => {
    const onExportAllRows = vi.fn();
    renderTable({ onExportAllRows });
    fireEvent.click(screen.getByLabelText("Export all rows as CSV"));
    expect(onExportAllRows).toHaveBeenCalledWith("csv");
  });

  it("offers only adapter-supported formats and exports the selected whole-result format", () => {
    const onExportAllRows = vi.fn();
    renderTable({ exportFormats: ["csv", "json"], onExportAllRows });

    expect(screen.getByRole("option", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "SQL INSERT" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Export format"), { target: { value: "json" } });
    fireEvent.click(screen.getByLabelText("Export all rows as JSON"));
    expect(onExportAllRows).toHaveBeenCalledWith("json");
  });

  it("labels MongoDB JSON export as Extended JSON", () => {
    renderTable({
      exportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      onExportAllRows: vi.fn()
    });

    expect(screen.getByRole("option", { name: "Extended JSON" })).toBeInTheDocument();
  });

  it("hides the export button when onExportAllRows is omitted", () => {
    renderTable();
    expect(screen.queryByLabelText("Export all rows as CSV")).not.toBeInTheDocument();
  });
});

describe("RowsTable row selection workflows (component rendering, F083)", () => {
  it("selects and clears every visible row from the header control", () => {
    renderTable();

    const selectPage = screen.getByLabelText("Select all rows on this page") as HTMLInputElement;
    expect(selectPage.closest("th")).toBeInTheDocument();

    fireEvent.click(selectPage);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(selectPage.checked).toBe(true);

    fireEvent.click(screen.getByLabelText("Clear selected rows"));
    expect(screen.queryByText("3 selected")).not.toBeInTheDocument();
  });

  it("selects consecutive rows by pressing and dragging across them", () => {
    renderTable();

    const firstRow = screen.getByText("Charlie").closest("tr");
    const secondRow = screen.getByText("Alice").closest("tr");
    expect(firstRow).toBeTruthy();
    expect(secondRow).toBeTruthy();

    fireEvent.pointerDown(firstRow as HTMLTableRowElement, { button: 0 });
    fireEvent.pointerEnter(secondRow as HTMLTableRowElement);
    fireEvent.pointerUp(window);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("exports selected rows from the loaded page instead of calling whole-table export", () => {
    const onExportAllRows = vi.fn();
    const onExportSelectedRows = vi.fn();
    renderTable({ onExportAllRows, onExportSelectedRows });

    fireEvent.click(screen.getByLabelText("Export all rows as CSV"));
    expect(onExportAllRows).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText("Select row 1"));
    fireEvent.click(screen.getByLabelText("Export selected rows as CSV"));

    expect(onExportSelectedRows).toHaveBeenCalledWith("id,name\n3,Charlie");
    expect(onExportAllRows).toHaveBeenCalledOnce();
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
    expect(onNavigateToForeignKey).toHaveBeenCalledWith(
      { table: "users", column: "id" },
      "Charlie"
    );
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

describe("RowsTable server-side filtering (component rendering, F072)", () => {
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

  it("hides the filter bar when onFiltersChange is omitted", () => {
    renderTable({ columns: fkColumns });
    expect(screen.queryByLabelText("Add filter")).not.toBeInTheDocument();
  });

  it("renders active filters as removable chips and clears them on click", () => {
    const onFiltersChange = vi.fn();
    renderTable({
      columns: fkColumns,
      filters: [{ column: "name", op: "eq", value: "Alice" }],
      onFiltersChange
    });

    const chip = screen.getByTitle("Edit filter");
    expect(chip).toHaveTextContent("name");
    expect(chip).toHaveTextContent("Alice");
    fireEvent.click(screen.getByLabelText("Remove filter on name"));
    expect(onFiltersChange).toHaveBeenCalledWith(undefined);
  });

  it("clicking a primary-key value replaces the filter set with a single drill-down filter", () => {
    const onFiltersChange = vi.fn();
    renderTable({
      columns: fkColumns,
      filters: [{ column: "name", op: "eq", value: "Bob" }],
      onFiltersChange
    });

    const [firstIdCell] = screen.getAllByTitle("Filter to this row (id)");
    fireEvent.click(firstIdCell as HTMLElement);

    expect(onFiltersChange).toHaveBeenCalledWith([{ column: "id", op: "eq", value: "3" }]);
  });
});
