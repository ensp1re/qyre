import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CellValueDrawer } from "./cell-value-drawer.js";

describe("CellValueDrawer with a plain string value (F069)", () => {
  it("shows the full value and its character count", () => {
    const long = "a".repeat(200);
    render(<CellValueDrawer value={long} onClose={vi.fn()} />);
    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText("200 chars")).toBeInTheDocument();
  });

  it("labels the copy button for plain text, not JSON", () => {
    render(<CellValueDrawer value={"x".repeat(150)} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Copy text")).toBeInTheDocument();
  });
});

describe("CellValueDrawer with a structured value", () => {
  it("still labels the copy button for JSON", () => {
    render(<CellValueDrawer value={{ a: 1 }} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Copy as JSON")).toBeInTheDocument();
  });
});
