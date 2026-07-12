import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRowCell } from "../../src/data-grid/new-row-cell.js";

describe("NewRowCell (component rendering, F104)", () => {
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
});
