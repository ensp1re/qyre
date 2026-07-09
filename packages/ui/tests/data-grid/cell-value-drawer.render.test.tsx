import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CellValueDrawer } from "../../src/data-grid/cell-value-drawer.js";

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

  it("shows the URL as a single link, not duplicated as plain text below it", () => {
    const value = "https://example.com/docs";
    render(<CellValueDrawer value={value} onClose={vi.fn()} />);

    expect(screen.getByRole("link", { name: value })).toHaveAttribute("href", value);
    expect(screen.getAllByText(value)).toHaveLength(1);
  });

  it("attempts an image preview for any http(s) URL, not just extension-matched ones", () => {
    // Real image CDNs (picsum.photos, unsplash) serve images from extensionless URLs -
    // classifyUrlValue's extension check is only a hint, so the preview always attempts to load
    // and relies on onError to hide itself for genuinely non-image links.
    const value = "https://picsum.photos/seed/abc/200/300";
    render(<CellValueDrawer value={value} onClose={vi.fn()} />);

    expect(
      screen.getByRole("img", { name: /image preview for picsum.photos\/seed\/abc\/200\/300/i })
    ).toHaveAttribute("src", value);
  });

  it("hides the image preview once it fails to load", () => {
    const value = "https://example.com/docs";
    render(<CellValueDrawer value={value} onClose={vi.fn()} />);

    const img = screen.getByRole("img", { name: /image preview/i });
    fireEvent.error(img);
    expect(screen.queryByRole("img", { name: /image preview/i })).not.toBeInTheDocument();
  });
});

describe("CellValueDrawer with a structured value", () => {
  it("still labels the copy button for JSON", () => {
    render(<CellValueDrawer value={{ a: 1 }} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Copy as JSON")).toBeInTheDocument();
  });
});
