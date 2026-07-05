import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CellValue } from "./cell-value.js";

describe("CellValue (component rendering, F055)", () => {
  it("renders a primitive value as plain text, matching formatCell", () => {
    render(<CellValue value={42} onInspect={vi.fn()} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a structured (object/array) value as an inspect chip, not the raw JSON", () => {
    render(<CellValue value={{ a: 1, b: 2 }} onInspect={vi.fn()} />);
    expect(screen.getByText("{ 2 keys }")).toBeInTheDocument();
  });

  it("renders a binary value as an inspect chip showing byte count", () => {
    render(<CellValue value={{ type: "Buffer", data: [1, 2, 3] }} onInspect={vi.fn()} />);
    expect(screen.getByText(/binary.*3 bytes/)).toBeInTheDocument();
  });

  it("calls onInspect with the raw value when a structured chip is clicked", () => {
    const onInspect = vi.fn();
    const value = { a: 1 };
    render(<CellValue value={value} onInspect={onInspect} />);
    fireEvent.click(screen.getByText("{ 1 key }"));
    expect(onInspect).toHaveBeenCalledWith(value);
  });
});
