import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditableCell } from "../../src/data-grid/cells/editable-cell.js";
import { chooseSelect } from "../support/select.js";

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

  it("renders a declared SQLite BOOLEAN value as true/false while keeping it editable", () => {
    render(
      <EditableCell
        displayValue={1}
        dataType="BOOLEAN"
        engine="sqlite"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    expect(screen.getByText("true")).toBeInTheDocument();
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
    expect(screen.getByRole("textbox", { name: "JSON editor" })).toBeInTheDocument();
  });

  it("opens bytea as hexadecimal text in the right-side drawer", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        columnName="payload"
        displayValue={{ type: "Buffer", data: [0, 202, 254] }}
        dataType="bytea"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit payload" }));
    expect(screen.getByTestId("cell-editor-drawer")).toBeInTheDocument();
    const editor = screen.getByRole("textbox", { name: "Edit cell value" });
    expect(editor).toHaveValue("00 ca fe");
    expect(screen.getByText("3 bytes")).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "00 ff" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onCommit).toHaveBeenCalledWith("00ff");
  });

  it("opens XML as raw multiline text in the right-side drawer", () => {
    const onCommit = vi.fn();
    const value = "<root><value>one</value></root>";
    render(
      <EditableCell
        columnName="document"
        displayValue={value}
        dataType="xml"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText(value));
    const editor = screen.getByRole("textbox", { name: "Edit cell value" });
    fireEvent.change(editor, { target: { value: "<root>\n  <value>two</value>\n</root>" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onCommit).toHaveBeenCalledWith("<root>\n  <value>two</value>\n</root>");
  });

  it("opens PostgreSQL intervals as lossless text in the right-side drawer", () => {
    const onCommit = vi.fn();
    render(
      <EditableCell
        columnName="duration"
        displayValue="1 day 02:03:04.5"
        dataType="interval"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText("1 day 02:03:04.5"));
    const editor = screen.getByRole("textbox", { name: "Edit cell value" });
    expect(screen.getByTestId("cell-editor-drawer")).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "2 days 03:04:05.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onCommit).toHaveBeenCalledWith("2 days 03:04:05.75");
  });

  it("converts a legacy PostgreSQL interval object into editable text", () => {
    render(
      <EditableCell
        columnName="duration"
        displayValue={{ days: 5, hours: 10, minutes: 15 }}
        dataType="interval"
        engine="postgres"
        nullable={false}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit duration" }));
    expect(screen.getByRole("textbox", { name: "Edit cell value" })).toHaveValue(
      "5 days 10 hours 15 minutes"
    );
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

  it("shows a True/False selector for a boolean column, with no NULL toggle to click (F146)", () => {
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
    chooseSelect("value", "False");
    expect(onCommit).toHaveBeenCalledWith(false);
  });

  it("closes the editor after a boolean selection, instead of leaving it stuck open (F146)", () => {
    render(
      <EditableCell
        displayValue={true}
        dataType="boolean"
        nullable={true}
        dirty={false}
        onCommit={vi.fn()}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText("true"));
    chooseSelect("value", "False");
    expect(screen.queryByRole("combobox", { name: "value" })).not.toBeInTheDocument();
  });

  it("commits and closes on blur even without pressing Enter, so a changed cell shows dirty right away (F146)", () => {
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
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("Grace");
    expect(screen.queryByLabelText("value")).not.toBeInTheDocument();
  });

  it("does not stage a no-op blur when the draft is unchanged", () => {
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
    fireEvent.blur(screen.getByLabelText("value"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("value")).not.toBeInTheDocument();
  });

  it("edits long plain text inline like any other text, not in a JSON-style popover (F146)", () => {
    const onCommit = vi.fn();
    const long = "a".repeat(320);
    render(
      <EditableCell
        displayValue={long}
        dataType="text"
        nullable={false}
        dirty={false}
        onCommit={onCommit}
        onRevert={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByText(`${"a".repeat(100)}...`));
    expect(screen.queryByTestId("cell-editor-surface")).not.toBeInTheDocument();
    const input = screen.getByLabelText("value") as HTMLInputElement;
    expect(input.value).toBe(long);
    const widthReserve = screen.getByTestId("cell-editor-width-reserve");
    expect(widthReserve).toHaveTextContent(`${"a".repeat(100)}...`);
    expect(widthReserve).toHaveClass("invisible", "w-max");
    fireEvent.change(input, { target: { value: "short now" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("short now");
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
    expect(screen.getByRole("button", { name: "Open date picker" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("value"), { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open date picker" })).not.toBeInTheDocument();
  });

  it("keeps the UTC/local/relative date detail affordance on an editable timestamp column (F146)", () => {
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

  it("opens JSON/array cell editing directly in the right-side drawer (F146)", () => {
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
    expect(screen.getByTestId("cell-editor-drawer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "{ 1 key }" })).toBeInTheDocument();
    expect(screen.queryByTestId("cell-editor-surface")).not.toBeInTheDocument();
    expect(screen.queryByText("jsonb")).not.toBeInTheDocument();
    expect(screen.queryByText("New value")).not.toBeInTheDocument();
    expect(screen.queryByText(/JSON is validated before Apply/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Format" })).toBeInTheDocument();
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
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByLabelText("first")).not.toBeInTheDocument();
    expect(screen.getByLabelText("second")).toBeInTheDocument();
  });
});
