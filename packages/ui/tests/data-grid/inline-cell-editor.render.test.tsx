import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineCellEditor } from "../../src/data-grid/editing/inline-cell-editor.js";
import { chooseSelect } from "../support/select.js";

describe("InlineCellEditor (F146)", () => {
  it("commits a plain text edit on Enter and reports the commit direction", () => {
    const onApply = vi.fn();
    const onCommitKey = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={vi.fn()}
        onCommitKey={onCommitKey}
      />
    );
    const input = screen.getByLabelText("name");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith("Grace");
    expect(onCommitKey).toHaveBeenCalledWith("enter");
  });

  it("commits on Tab and reports the tab direction without a Shift key", () => {
    const onApply = vi.fn();
    const onCommitKey = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={vi.fn()}
        onCommitKey={onCommitKey}
      />
    );
    const input = screen.getByLabelText("name");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onApply).toHaveBeenCalledWith("Grace");
    expect(onCommitKey).toHaveBeenCalledWith("tab");
  });

  it("reports shiftTab when Shift+Tab is pressed", () => {
    const onCommitKey = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onCommitKey={onCommitKey}
      />
    );
    fireEvent.keyDown(screen.getByLabelText("name"), { key: "Tab", shiftKey: true });
    expect(onCommitKey).toHaveBeenCalledWith("shiftTab");
  });

  it("cancels without applying on Escape", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Grace" } });
    fireEvent.keyDown(screen.getByLabelText("name"), { key: "Escape" });
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("edits a boolean with a True/False selector", () => {
    const onApply = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "active", dataType: "bool", nullable: true }}
        originalValue={false}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    chooseSelect("active", "True");
    expect(onApply).toHaveBeenCalledWith(true);
  });

  it("auto-stages NULL when a nullable field's text is cleared and left (no separate NULL button)", () => {
    const onApply = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "nickname", dataType: "varchar", nullable: true }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
    const input = screen.getByLabelText("nickname");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it("does not auto-null a non-nullable field left empty - it validates normally", () => {
    const onApply = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    const input = screen.getByLabelText("name");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith("");
  });

  it("uses a compact searchable dropdown for enum columns", () => {
    const onApply = vi.fn();
    render(
      <InlineCellEditor
        column={{
          name: "status",
          dataType: "status_enum",
          nullable: false,
          allowedValues: ["draft", "ready"]
        }}
        originalValue="draft"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    chooseSelect("status", "ready");
    expect(onApply).toHaveBeenCalledWith("ready");
  });

  it("edits a precision-bearing timestamp as plain text without normalizing it", () => {
    const onApply = vi.fn();
    const value = "2024-11-03 01:30:45.123456-04:00";
    render(
      <InlineCellEditor
        column={{ name: "seen_at", dataType: "timestamp with time zone", nullable: false }}
        engine="postgres"
        originalValue={value}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    const input = screen.getByLabelText("seen_at");
    expect(input).toHaveValue(value);
    const changed = "2024-11-03 01:30:45.123457-04:00";
    fireEvent.change(input, { target: { value: changed } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith(changed);
  });

  it("opening the date/time picker never stages a no-op edit for an unchanged value", () => {
    const onApply = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "seen_at", dataType: "timestamp with time zone", nullable: false }}
        engine="postgres"
        originalValue="2024-11-03 01:30:45.123456-04:00"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open date/time picker" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("blurring or committing an unchanged value does not stage a no-op edit", () => {
    const onApply = vi.fn();
    const onCommitKey = vi.fn();
    render(
      <InlineCellEditor
        column={{ name: "name", dataType: "varchar", nullable: false }}
        originalValue="Ada"
        onApply={onApply}
        onCancel={vi.fn()}
        onCommitKey={onCommitKey}
      />
    );
    const input = screen.getByLabelText("name");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onApply).not.toHaveBeenCalled();
    // Selection still advances even though nothing was staged.
    expect(onCommitKey).toHaveBeenCalledWith("tab");
  });

  it("offers an optional compact picker for timestamps that preserves the precise tail on change", () => {
    render(
      <InlineCellEditor
        column={{ name: "seen_at", dataType: "timestamp with time zone", nullable: false }}
        engine="postgres"
        originalValue="2024-11-03 01:30:45.123456-04:00"
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByTestId("inline-timestamp-picker")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open date/time picker" }));
    expect(screen.getByTestId("inline-timestamp-picker")).toBeInTheDocument();
  });
});
