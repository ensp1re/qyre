import type { ColumnMetadata, RowPage } from "@humbdb/core";
import { fireEvent, render, screen } from "@testing-library/react";
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

function renderTable() {
  return render(
    <RowsTable
      rowPage={rowPage}
      page={0}
      canGoPrevious={false}
      canGoNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
    />
  );
}

describe("RowsTable sort (component rendering, F055)", () => {
  it("renders rows in their original (unsorted) order by default", () => {
    renderTable();
    const cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("sorts ascending on the first header click, descending on the second", () => {
    renderTable();
    const nameHeader = screen.getByText("name");

    fireEvent.click(nameHeader);
    let cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Alice", "Bob", "Charlie"]);

    fireEvent.click(nameHeader);
    cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("a third header click clears the sort back to original order", () => {
    renderTable();
    const nameHeader = screen.getByText("name");

    fireEvent.click(nameHeader);
    fireEvent.click(nameHeader);
    fireEvent.click(nameHeader);
    const cells = screen.getAllByText(/^(Charlie|Alice|Bob)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("filters rows by the search box, case-insensitively", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Filter this page"), { target: { value: "ali" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
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
