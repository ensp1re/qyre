import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddColumnDialog } from "../../src/schema/dialogs/add-column-dialog.js";
import { chooseSelect } from "../support/select.js";

const POSTGRES_COLUMN_TYPES = ["text", "integer", "boolean"] as const;

describe("AddColumnDialog (component rendering, F114)", () => {
  it("disables Add column until the name is a valid identifier", () => {
    render(
      <AddColumnDialog
        table="orders"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const addButton = screen.getByRole("button", { name: "Add column" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "1bad" } });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total" } });
    expect(addButton).not.toBeDisabled();
  });

  it("calls onCreate with coerced values", () => {
    const onCreate = vi.fn();
    render(
      <AddColumnDialog
        table="orders"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total" } });
    chooseSelect("Column type", "integer");
    fireEvent.change(screen.getByLabelText("Default value"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("Not null"));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "total",
      dataType: "integer",
      nullable: false,
      default: 5
    });
  });

  it("shows the create error inline", () => {
    render(
      <AddColumnDialog
        table="orders"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        error='A column named "total" already exists.'
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('A column named "total" already exists.')).toBeInTheDocument();
  });

  it("closes on Escape and Cancel", () => {
    const onClose = vi.fn();
    render(
      <AddColumnDialog
        table="orders"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating={false}
        onCreate={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("disables Add column and Cancel while creating", () => {
    render(
      <AddColumnDialog
        table="orders"
        columnTypes={POSTGRES_COLUMN_TYPES}
        creating
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
