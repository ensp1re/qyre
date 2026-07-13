import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateTableDialog } from "../../src/schema/create-table-dialog.js";

const POSTGRES_COLUMN_TYPES = ["text", "integer", "boolean"] as const;

describe("CreateTableDialog (component rendering, F113)", () => {
  it("renders a SQL-engine form with a name field and one starter column row", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("New table")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("my_table")).toBeInTheDocument();
    expect(screen.getByLabelText("Column name")).toBeInTheDocument();
  });

  it("degrades to a name-only new-collection form when columnTypes is empty (MongoDB)", () => {
    render(
      <CreateTableDialog
        schema="test"
        columnTypes={[]}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("New collection")).toBeInTheDocument();
    expect(screen.queryByLabelText("Column name")).not.toBeInTheDocument();
    expect(screen.getByText(/db\.createCollection/)).toBeInTheDocument();
  });

  it("disables Create until the table name is a valid identifier", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const createButton = screen.getByRole("button", { name: "Create table" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "1bad" } });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "orders" } });
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "id" } });
    expect(createButton).not.toBeDisabled();
  });

  it("disables Create when a column name is invalid", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "orders" } });
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "1bad" } });
    expect(screen.getByRole("button", { name: "Create table" })).toBeDisabled();
  });

  it("adds and removes column rows", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByLabelText("Column name")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getAllByLabelText("Column name")).toHaveLength(2);

    const [firstRemoveButton] = screen.getAllByRole("button", { name: "Remove column" });
    if (!firstRemoveButton) throw new Error("Expected a Remove column button.");
    fireEvent.click(firstRemoveButton);
    expect(screen.getAllByLabelText("Column name")).toHaveLength(1);
  });

  it("calls onCreate with the table name and coerced column values", () => {
    const onCreate = vi.fn();
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "orders" } });
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total" } });
    fireEvent.change(screen.getByLabelText("Column type"), { target: { value: "integer" } });
    fireEvent.change(screen.getByLabelText("Default value"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Create table" }));

    expect(onCreate).toHaveBeenCalledWith("orders", [
      { name: "total", dataType: "integer", nullable: true, default: 5 }
    ]);
  });

  it("submits a null default when the default field is left empty", () => {
    const onCreate = vi.fn();
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "orders" } });
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "note" } });
    fireEvent.click(screen.getByRole("button", { name: "Create table" }));

    expect(onCreate).toHaveBeenCalledWith("orders", [
      { name: "note", dataType: "text", nullable: true, default: null }
    ]);
  });

  it("marks a column NOT NULL when its checkbox is checked", () => {
    const onCreate = vi.fn();
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("my_table"), { target: { value: "orders" } });
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "id" } });
    fireEvent.click(screen.getByLabelText("Not null"));
    fireEvent.click(screen.getByRole("button", { name: "Create table" }));

    expect(onCreate).toHaveBeenCalledWith("orders", [
      { name: "id", dataType: "text", nullable: false, default: null }
    ]);
  });

  it("shows the create error inline without closing", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        error='A table named "orders" already exists.'
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('A table named "orders" already exists.')).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables Create and Cancel while creating", () => {
    render(
      <CreateTableDialog
        schema="public"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
