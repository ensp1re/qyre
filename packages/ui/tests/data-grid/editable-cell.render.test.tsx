import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditableCell } from "../../src/data-grid/cells/editable-cell.js";

describe("EditableCell (component rendering, F103/F146)", () => {
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

  it("renders an empty string distinctly from null", () => {
    render(
      <EditableCell
        displayValue=""
        dataType="varchar"
        nullable={true}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    expect(screen.getByText('""')).toBeInTheDocument();
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
    expect(screen.queryByLabelText("value")).not.toBeInTheDocument();
  });

  it("a single click selects without opening the editor", () => {
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
    expect(screen.queryByLabelText("value")).not.toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
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
    const input = screen.getByLabelText("value") as HTMLInputElement;
    expect(input.value).toBe("Ada");

    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Grace");
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
    expect(screen.queryByRole("textbox", { name: "New value" })).not.toBeInTheDocument();

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
    fireEvent.doubleClick(activation);
    fireEvent.keyDown(screen.getByLabelText("value"), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("value")).not.toBeInTheDocument();
    expect(screen.getByText("Ada")).toHaveFocus();
  });

  it("Enter on the selected display cell also starts editing", () => {
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
    expect(screen.getByLabelText("value")).toBeInTheDocument();
  });

  it("F2 on the selected display cell starts editing", () => {
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
    expect(screen.getByLabelText("value")).toBeInTheDocument();
  });

  it("Delete on a nullable selected cell commits NULL immediately", () => {
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
    fireEvent.keyDown(screen.getByText("Ada"), { key: "Delete" });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("edits a precision-bearing timestamp in place without normalizing it", () => {
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
    fireEvent.doubleClick(screen.getByText(value));
    const input = screen.getByLabelText("value");
    expect(input).toHaveValue(value);
    fireEvent.change(input, { target: { value: "2024-11-03 01:30:45.123457-04:00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("2024-11-03 01:30:45.123457-04:00");
  });

  it("commits a valid number and keeps an invalid one open with an inline error", () => {
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
    const input = screen.getByLabelText("value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("42");
  });

  it("shows an immediate switch for a boolean column, with no NULL toggle to click (F146)", () => {
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
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "value" }));
    expect(onCommit).toHaveBeenCalledWith(false);
  });

  it("auto-stages NULL for a nullable text column left empty, instead of an explicit toggle (F146)", () => {
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
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
    const input = screen.getByLabelText("value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("commits an empty string as-is for a non-nullable text column (there is no NULL to fall back to)", () => {
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
    const input = screen.getByLabelText("value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("auto-stages NULL for a nullable numeric column left empty, without a validation error (F146)", () => {
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
    const input = screen.getByLabelText("value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("keeps a non-nullable numeric column's empty draft open with a validation error (nothing to fall back to)", () => {
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
    const input = screen.getByLabelText("value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("value")).toHaveAttribute("aria-invalid", "true");
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
    fireEvent.doubleClick(screen.getByText("9007199254740991"));
    const input = screen.getByLabelText("value");
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
    fireEvent.doubleClick(screen.getByText("1"));
    const input = screen.getByLabelText("value");
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
    fireEvent.doubleClick(screen.getByText("2024-03-05"));
    expect(screen.getByRole("button", { name: "Choose date" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Choose date" }), { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Choose date" })).not.toBeInTheDocument();
  });

  it("keeps the UTC/local/relative date detail affordance on an editable timestamp column (F146)", () => {
    // Regression guard: EditableCell's non-editing display used to bypass CellValue entirely for
    // non-structured values, so an editable date/timestamp column silently lost the "Click for
    // UTC, local time, and more" popover that read-only columns still had (DateDetailPopover).
    const onInspectDate = vi.fn();
    render(
      <EditableCell
        displayValue="2026-03-05T19:57:11.880Z"
        dataType="timestamptz"
        nullable={false}
        dirty={false}
        onInspectDate={onInspectDate}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    const dateLink = screen.getByTitle("Click for UTC, local time, and more");
    fireEvent.click(dateLink);
    expect(onInspectDate).toHaveBeenCalledWith("2026-03-05T19:57:11.880Z", expect.anything());
    expect(screen.getByRole("button", { name: "Edit value" })).toBeInTheDocument();
  });

  it("opens JSON/array cell editing in a small anchored popover by default, not a permanent drawer (F146)", () => {
    render(
      <EditableCell
        columnName="profile"
        displayValue={{ active: true }}
        dataType="jsonb"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByTestId("cell-editor-surface")).toBeInTheDocument();
    expect(screen.queryByTestId("cell-editor-drawer")).not.toBeInTheDocument();
  });

  it("opens the full right-side drawer only via the explicit Expand action (F146)", () => {
    render(
      <EditableCell
        columnName="profile"
        displayValue={{ active: true }}
        dataType="jsonb"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand to full panel" }));
    expect(screen.getByTestId("cell-editor-drawer")).toBeInTheDocument();
  });

  it("only one editor is active at a time when coordinated by a parent (F146)", () => {
    function Harness(): ReactNode {
      const [active, setActive] = useState<string | null>(null);
      return (
        <>
          <EditableCell
            columnName="first"
            displayValue="Ada"
            dataType="varchar"
            nullable={false}
            dirty={false}
            onCommit={vi.fn()}
            onRevert={vi.fn()}
            isActive={active === "first"}
            onActivate={() => setActive("first")}
            onDeactivate={() => setActive((current) => (current === "first" ? null : current))}
          />
          <EditableCell
            columnName="second"
            displayValue="Grace"
            dataType="varchar"
            nullable={false}
            dirty={false}
            onCommit={vi.fn()}
            onRevert={vi.fn()}
            isActive={active === "second"}
            onActivate={() => setActive("second")}
            onDeactivate={() => setActive((current) => (current === "second" ? null : current))}
          />
        </>
      );
    }
    render(<Harness />);
    fireEvent.doubleClick(screen.getByText("Ada"));
    expect(screen.getByLabelText("first")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText("Grace"));
    // "Ada"'s cell reverts to its plain display (still visible as text) - only "Grace" is editing,
    // so exactly one editor surface exists, not two stacked on top of each other.
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByLabelText("first")).not.toBeInTheDocument();
    expect(screen.getByLabelText("second")).toBeInTheDocument();
  });
});
