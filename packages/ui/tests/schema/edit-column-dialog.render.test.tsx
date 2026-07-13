import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditColumnDialog } from "../../src/schema/edit-column-dialog.js";

const POSTGRES_COLUMN_TYPES = ["text", "integer", "boolean"] as const;

describe("EditColumnDialog (component rendering, F114)", () => {
  it("prefills the current name, type, and nullability", () => {
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Column name")).toHaveValue("total");
    expect(screen.getByLabelText("Column type")).toHaveValue("integer");
    expect(screen.getByLabelText("Not null")).toBeChecked();
  });

  it("disables Save until something actually changes", () => {
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total_amount" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("submits only newName when just the name changed", () => {
    const onSave = vi.fn();
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total_amount" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ newName: "total_amount" });
  });

  it("submits only the changed fields in changes when type/nullability change", () => {
    const onSave = vi.fn();
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Column type"), { target: { value: "text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ changes: { dataType: "text" } });
  });

  it("submits both newName and changes when both change", () => {
    const onSave = vi.fn();
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "total_amount" } });
    fireEvent.click(screen.getByLabelText("Not null"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      newName: "total_amount",
      changes: { nullable: true }
    });
  });

  it("shows the save error inline", () => {
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        error="This engine does not support altering columns."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("This engine does not support altering columns.")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <EditColumnDialog
        table="orders"
        columnName="total"
        currentDataType="integer"
        currentNullable={false}
        columnTypes={POSTGRES_COLUMN_TYPES}
        saving={false}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
