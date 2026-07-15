import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRowCell } from "../../src/data-grid/cells/new-row-cell.js";

describe("NewRowCell (component rendering, F104)", () => {
  it("fails closed instead of falling back to text for a precision-bearing timestamp", () => {
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
    expect(screen.getByText("not editable")).toHaveAttribute(
      "title",
      expect.stringMatching(/seconds.*precision.*timezone/i)
    );
    expect(screen.queryByLabelText("New row value")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a text input pre-filled with the given value", () => {
    render(<NewRowCell value="Ada" dataType="varchar" nullable={false} onChange={vi.fn()} />);
    expect(screen.getByLabelText("New row value")).toHaveValue("Ada");
  });

  it("renders an empty input when the value is undefined - the column is untouched", () => {
    render(<NewRowCell value={undefined} dataType="varchar" nullable={true} onChange={vi.fn()} />);
    expect(screen.getByLabelText("New row value")).toHaveValue("");
  });

  it("commits a text value on blur", () => {
    const onChange = vi.fn();
    render(
      <NewRowCell value={undefined} dataType="varchar" nullable={false} onChange={onChange} />
    );
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("Grace");
  });

  it("commits a text value on Enter", () => {
    const onChange = vi.fn();
    render(
      <NewRowCell value={undefined} dataType="varchar" nullable={false} onChange={onChange} />
    );
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "Grace" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Grace");
  });

  it("blurring an empty input reports undefined - back to untouched", () => {
    const onChange = vi.fn();
    render(<NewRowCell value="Ada" dataType="varchar" nullable={true} onChange={onChange} />);
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("commits a valid number and drops an invalid one, for a numeric column", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="int4" nullable={false} onChange={onChange} />);
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it("shows true/false/null buttons for a boolean column, and reports the picked value immediately", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="boolean" nullable={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "true" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("hides the null option for a boolean column when the column isn't nullable", () => {
    render(<NewRowCell value={undefined} dataType="boolean" nullable={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "null" })).not.toBeInTheDocument();
  });

  it("rejects an integer draft beyond Number.MAX_SAFE_INTEGER instead of silently rounding it (F140/U5)", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="bigint" nullable={false} onChange={onChange} />);
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "9007199254740993" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    // The rejected draft stays visible for the user to fix, not silently discarded. Reads
    // `.value` directly rather than jest-dom's toHaveValue, which coerces a number-type input's
    // expectation through Number() and would itself lose the exact precision this test checks.
    expect((input as HTMLInputElement).value).toBe("9007199254740993");
  });

  it("commits a safe-integer bigint value normally", () => {
    const onChange = vi.fn();
    render(<NewRowCell value={undefined} dataType="bigint" nullable={false} onChange={onChange} />);
    const input = screen.getByLabelText("New row value");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(42);
  });
});
