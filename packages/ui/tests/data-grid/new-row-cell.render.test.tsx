import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRowCell } from "../../src/data-grid/cells/new-row-cell.js";
import { chooseSelect } from "../support/select.js";

function openEditor(name = "Set value"): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("NewRowCell (component rendering, F104)", () => {
  it("edits a precision-bearing timestamp without normalizing it", () => {
    const onChange = vi.fn();
    render(
      <NewRowCell
        value="2024-11-03 01:30:45.123456-04:00"
        dataType="timestamp with time zone"
        engine="postgres"
        nullable={false}
        onChange={onChange}
      />
    );
    openEditor("Edit value");
    const input = screen.getByLabelText("New row value");
    expect(input).toHaveValue("2024-11-03 01:30:45.123456-04:00");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2024-11-03 01:30:45.123456-04:00");
  });

  it("opens a text editor pre-filled with the given value", () => {
    render(<NewRowCell value="Ada" dataType="varchar" nullable={false} onChange={vi.fn()} />);
    openEditor("Edit value");
    expect(screen.getByLabelText("New row value")).toHaveValue("Ada");
  });

  it("opens an empty editor when the column is untouched", () => {
    render(<NewRowCell value={undefined} dataType="varchar" nullable={true} onChange={vi.fn()} />);
    openEditor();
    expect(screen.getByLabelText("New row value")).toHaveValue("");
  });

  it("does not commit a text value on blur", () => {
    const onChange = vi.fn();
    render(
      <NewRowCell value={undefined} dataType="varchar" nullable={false} onChange={onChange} />
    );
    openEditor();
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits a text value on Enter", () => {
    const onChange = vi.fn();
    render(
      <NewRowCell value={undefined} dataType="varchar" nullable={false} onChange={onChange} />
    );
    openEditor();
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Grace");
  });

  it("resets an explicit value to the database default", () => {
    const onChange = vi.fn();
    render(<NewRowCell value="Ada" dataType="varchar" nullable={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Use default for value" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("commits a valid number and drops an invalid one, for a numeric column", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="int4" nullable={false} onChange={onChange} />);
    openEditor();
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("42");
  });

  it("shows true/false/null buttons for a boolean column, and reports the picked value immediately", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="boolean" nullable={true} onChange={onChange} />);
    openEditor();
    chooseSelect("New row value", "true");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("hides the null option for a boolean column when the column isn't nullable", () => {
    render(<NewRowCell value={undefined} dataType="boolean" nullable={false} onChange={vi.fn()} />);
    openEditor();
    expect(screen.queryByRole("button", { name: "NULL" })).not.toBeInTheDocument();
  });

  it("preserves an integer draft beyond Number.MAX_SAFE_INTEGER as exact text (F140/U5)", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="bigint" nullable={false} onChange={onChange} />);
    openEditor();
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "9007199254740993" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("9007199254740993");
  });

  it("commits a safe-integer bigint value normally", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="bigint" nullable={false} onChange={onChange} />);
    openEditor();
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("42");
  });
});
