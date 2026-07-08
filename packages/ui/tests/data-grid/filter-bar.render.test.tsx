import type { ColumnMetadata } from "@qyre/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/data-grid/filter-bar.js";

const columns: ColumnMetadata[] = [
  { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "text", nullable: false, isPrimaryKey: false, isForeignKey: false },
  {
    name: "deleted_at",
    dataType: "timestamp",
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  }
];

function openPopover(): void {
  fireEvent.click(screen.getByLabelText("Add filter"));
}

describe("FilterBar (F072)", () => {
  it("composes a value filter through the column -> operator -> value flow", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("name"));
    fireEvent.click(screen.getByRole("option", { name: /contains/ }));
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "ali" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "name", op: "contains", value: "ali" }
    ]);
  });

  it("applies a null-check operator immediately without a value step", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Columns" })).getByText("deleted_at")
    );
    fireEvent.click(screen.getByRole("option", { name: "is null" }));

    expect(onFiltersChange).toHaveBeenCalledWith([{ column: "deleted_at", op: "isNull" }]);
    expect(screen.queryByLabelText("Filter value")).not.toBeInTheDocument();
  });

  it("filters the column list by the search query and picks with the keyboard", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    const search = screen.getByLabelText("Search columns");
    fireEvent.change(search, { target: { value: "name" } });

    const listbox = screen.getByRole("listbox", { name: "Columns" });
    expect(within(listbox).queryByText("id")).not.toBeInTheDocument();
    expect(within(listbox).getByText("name")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Enter" });
    // Column picked -> now on the operator step.
    expect(screen.getByRole("listbox", { name: "Operators" })).toBeInTheDocument();
  });

  it("orders operators by column kind (contains first for text)", () => {
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={vi.fn()} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("name"));

    const options = within(screen.getByRole("listbox", { name: "Operators" })).getAllByRole(
      "option"
    );
    expect(options[0]).toHaveTextContent("contains");
  });

  it("adds to the existing AND set rather than replacing it", () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterBar
        columns={columns}
        filters={[{ column: "id", op: "eq", value: "1" }]}
        onFiltersChange={onFiltersChange}
      />
    );

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("name"));
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "id", op: "eq", value: "1" },
      { column: "name", op: "eq", value: "x" }
    ]);
  });

  it("edits an existing filter in place when its chip is clicked", () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterBar
        columns={columns}
        filters={[{ column: "name", op: "eq", value: "old" }]}
        onFiltersChange={onFiltersChange}
      />
    );

    fireEvent.click(screen.getByTitle("Edit filter"));
    const value = screen.getByLabelText("Filter value");
    expect(value).toHaveValue("old");
    fireEvent.change(value, { target: { value: "new" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(onFiltersChange).toHaveBeenCalledWith([{ column: "name", op: "eq", value: "new" }]);
  });

  it("shows an AND separator and a Clear action once two filters are active", () => {
    const onFiltersChange = vi.fn();
    render(
      <FilterBar
        columns={columns}
        filters={[
          { column: "id", op: "gt", value: "1" },
          { column: "name", op: "contains", value: "a" }
        ]}
        onFiltersChange={onFiltersChange}
      />
    );

    expect(screen.getByText("and")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear all filters"));
    expect(onFiltersChange).toHaveBeenCalledWith(undefined);
  });

  it("walks back a step on Escape before closing", () => {
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={vi.fn()} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("name"));
    expect(screen.getByRole("listbox", { name: "Operators" })).toBeInTheDocument();

    // Esc from the operator step returns to the column step, not straight to closed.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("listbox", { name: "Columns" })).toBeInTheDocument();
  });

  it("disables the trigger when the table has no columns", () => {
    render(<FilterBar columns={[]} filters={undefined} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText("Add filter")).toBeDisabled();
  });
});
