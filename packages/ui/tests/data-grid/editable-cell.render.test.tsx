import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditableCell } from "../../src/data-grid/cells/editable-cell.js";
import { chooseSelect } from "../support/select.js";

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

  it("click opens a text editor pre-filled with the current value, and Enter commits it", () => {
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
    fireEvent.click(screen.getByText("Ada"));
    const input = screen.getByLabelText("Edit cell value") as HTMLInputElement;
    expect(input.value).toBe("Ada");

    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Grace");
  });

  it("keeps Enter for multiline text and applies with Ctrl/Cmd+Enter", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        displayValue="Ada"
        dataType="text"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Ada"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "Grace\nHopper" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith("Grace\nHopper");
  });

  it("keeps structured inspection and editing as distinct actions", () => {
    const value = { account: { active: true } };
    const onInspect = vi.fn();
    render(
      <EditableCell
        columnName="profile"
        displayValue={value}
        dataType="jsonb"
        engine="postgres"
        nullable={false}
        dirty={false}
        onInspect={onInspect}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "{ 1 key }" }));
    expect(onInspect).toHaveBeenCalledWith(value);
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByRole("textbox", { name: "New value" })).toBeInTheDocument();
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
    const activation = screen.getByText("Ada");
    fireEvent.click(activation);
    fireEvent.keyDown(screen.getByLabelText("Edit cell value"), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit cell value")).not.toBeInTheDocument();
    expect(screen.getByText("Ada")).toHaveFocus();
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

  it("F2 on the display cell starts editing", () => {
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
    fireEvent.keyDown(screen.getByText("Ada"), { key: "F2" });
    expect(screen.getByLabelText("Edit cell value")).toBeInTheDocument();
  });

  it("anchors the editor in an overlay without changing the cell's layout footprint", () => {
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
    fireEvent.click(screen.getByText("Ada"));
    expect(screen.getByTestId("cell-editor-anchor")).toHaveClass("relative", "h-5");
    expect(screen.getByTestId("cell-editor-surface")).toHaveClass("fixed");
  });

  it("edits a precision-bearing timestamp without normalizing it", () => {
    const onCommit = vi.fn();
    const value = "2024-11-03 01:30:45.123456-04:00";
    render(
      <EditableCell
        displayValue={value}
        dataType="timestamp with time zone"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(value));
    const input = screen.getByLabelText("Edit cell value");
    expect(input).toHaveValue(value);
    fireEvent.change(input, { target: { value: "2024-11-03 01:30:45.123457-04:00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("2024-11-03 01:30:45.123457-04:00");
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
    fireEvent.click(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("42");
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
    fireEvent.click(screen.getByText("true"));
    chooseSelect("Edit cell value", "false");
    expect(screen.getByRole("button", { name: "NULL" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
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
    fireEvent.click(screen.getByText("true"));
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Ada"));
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
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.click(screen.getByRole("button", { name: "NULL" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
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
    fireEvent.click(screen.getByText("Ada"));
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
  });

  it("keeps an invalid empty numeric draft open, then permits an explicit NULL (F140/U2)", () => {
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
    fireEvent.click(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Edit cell value")).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("button", { name: "NULL" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("commits an integer draft beyond Number.MAX_SAFE_INTEGER as exact text (F140/U5)", () => {
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
    fireEvent.click(screen.getByText("9007199254740991"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "9007199254740993" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith("9007199254740993");
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
    fireEvent.click(screen.getByText("1"));
    const input = screen.getByLabelText("Edit cell value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("42");
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
    fireEvent.click(screen.getByText("2024-03-05"));
    expect(screen.getByRole("button", { name: "Choose date" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Choose date" }), { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Choose date" })).not.toBeInTheDocument();
  });
});
