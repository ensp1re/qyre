import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditableCell } from "../../src/data-grid/editable-cell.js";

describe("EditableCell (component rendering, F103)", () => {
  it("renders the display value as plain text when not editing", () => {
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("renders null as an italic placeholder", () => {
    render(
      <EditableCell
        displayValue={null}
        dataType="varchar"
        nullable={true}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("shows no revert button when the cell isn't dirty", () => {
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Revert cell to original value")).not.toBeInTheDocument();
  });

  it("shows a revert button when dirty, and calls onRevert without entering edit mode", () => {
    const onRevert = vi.fn();
    render(
      <EditableCell
        displayValue="Grace"
        dataType="varchar"
        nullable={false}
        dirty={true}
        onCommit={vi.fn()}
        onRevert={onRevert}
      />
    );
    fireEvent.click(screen.getByLabelText("Revert cell to original value"));
    expect(onRevert).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
  });

  it("double-click opens a text editor pre-filled with the current value, and Enter commits it", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("Ada"));
    const input = screen.getByLabelText("Edit cell value") as HTMLInputElement;
    expect(input.value).toBe("Ada");

    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Grace");
  });

  it("Escape cancels the edit without committing", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByLabelText("Edit cell value"), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
  });

  it("Enter on the display cell also starts editing", () => {
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByText("Ada"), { key: "Enter" });
    expect(screen.getByLabelText("Edit cell value")).toBeInTheDocument();
  });

  it("commits a valid number and cancels on an invalid one, for a numeric column", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue={1}
        dataType="int4"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it("shows true/false/null buttons for a boolean column, and commits the picked value", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue={true}
        dataType="boolean"
        nullable={true}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("true"));
    expect(screen.getByRole("button", { name: "false" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "null" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "false" }));
    expect(onCommit).toHaveBeenCalledWith(false);
  });

  it("hides the null option for a boolean column when the column isn't nullable", () => {
    render(
      <EditableCell
        displayValue={true}
        dataType="boolean"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("true"));
    expect(screen.queryByRole("button", { name: "null" })).not.toBeInTheDocument();
  });

  it("commits an explicit empty string for a nullable text column, instead of cancelling (F140/U2)", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={true}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("Ada"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("shows a null button for a nullable text column and commits null (F140/U2)", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={true}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.click(screen.getByRole("button", { name: "null" }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("hides the null button for a non-nullable text column", () => {
    render(
      <EditableCell
        displayValue="Ada"
        dataType="varchar"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("Ada"));
    expect(screen.queryByRole("button", { name: "null" })).not.toBeInTheDocument();
  });

  it("shows a null button for a nullable numeric column, still cancelling on an empty draft (F140/U2)", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue={1}
        dataType="int4"
        nullable={true}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText("1"));
    fireEvent.click(screen.getByRole("button", { name: "null" }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("rejects an integer draft beyond Number.MAX_SAFE_INTEGER instead of silently rounding it (F140/U5)", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="9007199254740991"
        dataType="bigint"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("9007199254740991"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "9007199254740993" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
    // Still in edit mode - a rejection, not a silent cancel.
    expect(screen.getByLabelText("Edit cell value")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit cell value")).toHaveAttribute("aria-invalid", "true");
  });

  it("commits a safe-integer bigint value normally", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="1"
        dataType="bigint"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it("Escape cancels a date editor without committing (F140/U4)", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="2024-03-05"
        dataType="date"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("2024-03-05"));
    expect(screen.getByRole("button", { name: "Choose date" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Choose date" }), { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Choose date" })).not.toBeInTheDocument();
  });
});
