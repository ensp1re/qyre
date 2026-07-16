import type { ColumnMetadata } from "@qyre/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/data-grid/table/filter-bar.js";
import { chooseSelect } from "../support/select.js";

const columns: ColumnMetadata[] = [
  { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "text", nullable: false, isPrimaryKey: false, isForeignKey: false },
  {
    name: "deleted_at",
    dataType: "timestamp",
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  },
  {
    name: "is_active",
    dataType: "boolean",
    nullable: false,
    isPrimaryKey: false,
    isForeignKey: false
  },
  { name: "col_date", dataType: "date", nullable: true, isPrimaryKey: false, isForeignKey: false },
  {
    name: "col_time",
    dataType: "time without time zone",
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

describe("FilterBar type-aware operators and values (F082)", () => {
  it("filters PostgreSQL JSON and arrays with a validated contains value", () => {
    const onFiltersChange = vi.fn();
    const structuredColumns: ColumnMetadata[] = [
      {
        name: "payload",
        dataType: "jsonb",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      },
      {
        name: "tags",
        dataType: "ARRAY",
        elementDataType: "text",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      }
    ];
    render(
      <FilterBar
        columns={structuredColumns}
        engine="postgres"
        filters={undefined}
        onFiltersChange={onFiltersChange}
      />
    );

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("payload"));
    fireEvent.click(screen.getByRole("option", { name: "contains" }));
    fireEvent.change(screen.getByLabelText("Filter JSON value"), {
      target: { value: '{"role":"admin"}' }
    });
    fireEvent.click(screen.getByText("Apply"));
    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "payload", op: "contains", value: '{"role":"admin"}' }
    ]);
  });

  it("uses authoritative enum options for equality filters", () => {
    const onFiltersChange = vi.fn();
    const enumColumns: ColumnMetadata[] = [
      {
        name: "status",
        dataType: "status_enum",
        allowedValues: ["draft", "ready"],
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false
      }
    ];
    render(
      <FilterBar
        columns={enumColumns}
        engine="postgres"
        filters={undefined}
        onFiltersChange={onFiltersChange}
      />
    );

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("status"));
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));
    chooseSelect("Filter value", "ready");
    fireEvent.click(screen.getByText("Apply"));
    expect(onFiltersChange).toHaveBeenCalledWith([{ column: "status", op: "eq", value: "ready" }]);
  });

  it("offers only eq/neq for a non-null boolean column, not text/comparison/null operators", () => {
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={vi.fn()} />);

    openPopover();
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Columns" })).getByText("is_active")
    );

    const options = within(screen.getByRole("listbox", { name: "Operators" })).getAllByRole(
      "option"
    );
    expect(options.map((option) => option.textContent)).toEqual(["equals=", "not equals≠"]);
  });

  it("does not offer contains for numeric columns", () => {
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={vi.fn()} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("id"));

    const options = within(screen.getByRole("listbox", { name: "Operators" })).getAllByRole(
      "option"
    );
    expect(options.map((option) => option.textContent)).toEqual([
      "equals=",
      "not equals≠",
      "greater than>",
      "greater or equal≥",
      "less than<",
      "less or equal≤"
    ]);
  });

  it("shows a true/false picker (not a text input) for a boolean column's value step", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Columns" })).getByText("is_active")
    );
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));

    expect(screen.queryByLabelText("Filter value")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("false"));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "is_active", op: "eq", value: "false" }
    ]);
  });

  it("uses the themed date picker (not a native input) for a DATE column's value step", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("col_date"));
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));

    expect(screen.queryByLabelText("Filter value")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
    fireEvent.click(screen.getAllByRole("button", { name: "1" })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "col_date", op: "eq", value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }
    ]);
  });

  it("uses the themed hour/minute segments (not a native input) for a TIME column's value step", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Columns" })).getByText("col_time"));
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));

    expect(screen.queryByLabelText("Filter value")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { column: "col_time", op: "eq", value: "14:30" }
    ]);
  });

  it("combines the date picker and time segments for a TIMESTAMP column's value step", () => {
    const onFiltersChange = vi.fn();
    render(<FilterBar columns={columns} filters={undefined} onFiltersChange={onFiltersChange} />);

    openPopover();
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Columns" })).getByText("deleted_at")
    );
    fireEvent.click(screen.getByRole("option", { name: /^equals/ }));

    expect(screen.getByRole("button", { name: "Choose date" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hour")).toBeInTheDocument();
    expect(screen.getByLabelText("Minute")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
    fireEvent.click(screen.getAllByRole("button", { name: "1" })[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "09" } });
    fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "05" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onFiltersChange).toHaveBeenCalledWith([
      {
        column: "deleted_at",
        op: "eq",
        value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T09:05$/)
      }
    ]);
  });

  it("hides MongoDB MinKey/MaxKey sentinel columns from scalar filtering", () => {
    render(
      <FilterBar
        engine="mongodb"
        columns={[
          {
            name: "_id",
            dataType: "objectId",
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: false
          },
          {
            name: "minKeyField",
            dataType: "minKey",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          },
          {
            name: "maxKeyField",
            dataType: "maxKey",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]}
        filters={undefined}
        onFiltersChange={vi.fn()}
      />
    );

    openPopover();

    const listbox = screen.getByRole("listbox", { name: "Columns" });
    expect(within(listbox).getByText("_id")).toBeInTheDocument();
    expect(within(listbox).queryByText("minKeyField")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("maxKeyField")).not.toBeInTheDocument();
  });
});
