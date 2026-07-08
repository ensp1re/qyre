import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar.js";

const BASE_PROPS = {
  target: "postgres://localhost/db",
  status: "connected" as const,
  schemas: [],
  onSelect: vi.fn(),
  open: true,
  onOpenChange: vi.fn()
};

describe("Sidebar resizing (F071)", () => {
  it("does not render a resize handle when width/onWidthChange are omitted", () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("renders a resize handle reflecting the given width when both props are supplied", () => {
    render(<Sidebar {...BASE_PROPS} width={300} onWidthChange={vi.fn()} />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
  });

  it("calls onWidthChange when the handle is dragged", () => {
    const onWidthChange = vi.fn();
    render(<Sidebar {...BASE_PROPS} width={300} onWidthChange={onWidthChange} />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 150 });
    expect(onWidthChange).toHaveBeenCalledWith(350);
  });

  it("does not render a resize handle when the sidebar is collapsed, even with width/onWidthChange set", () => {
    render(<Sidebar {...BASE_PROPS} open={false} width={300} onWidthChange={vi.fn()} />);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
