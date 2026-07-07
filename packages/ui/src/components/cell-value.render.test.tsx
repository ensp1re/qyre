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

  it("renders a short string as plain text, not a truncated button", () => {
    render(<CellValue value="hello" onInspect={vi.fn()} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a long string as a clickable truncated button and calls onInspect with the full value", () => {
    const onInspect = vi.fn();
    const long = "a".repeat(200);
    render(<CellValue value={long} onInspect={onInspect} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(long);
    fireEvent.click(button);
    expect(onInspect).toHaveBeenCalledWith(long);
  });

  it("renders a date-column string as a clickable date and calls onInspectDate with its bounding rect (F070)", () => {
    const onInspectDate = vi.fn();
    render(
      <CellValue
        value="2024-01-15T10:30:00.000Z"
        dataType="timestamp with time zone"
        onInspect={vi.fn()}
        onInspectDate={onInspectDate}
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("2024-01-15T10:30:00.000Z");
    fireEvent.click(button);
    expect(onInspectDate).toHaveBeenCalledWith(
      "2024-01-15T10:30:00.000Z",
      expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) })
    );
  });

  it("does not treat a date-column value as clickable when onInspectDate is omitted", () => {
    render(<CellValue value="2024-01-15T10:30:00.000Z" dataType="date" onInspect={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("2024-01-15T10:30:00.000Z")).toBeInTheDocument();
  });

  it("does not treat a non-date column's string value as clickable-date even with onInspectDate set", () => {
    render(<CellValue value="hello" dataType="text" onInspect={vi.fn()} onInspectDate={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
