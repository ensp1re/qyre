import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitleBar } from "../../src/shell/title-bar.js";

const baseProps = {
  status: "connected" as const,
  target: "postgres://postgres:***@localhost:5432/qyre_demo",
  theme: "dark" as const,
  onToggleTheme: vi.fn(),
  onRefresh: vi.fn(),
  onToggleSidebar: vi.fn(),
  onOpenConnection: vi.fn(),
  onOpenSettings: vi.fn()
};

describe("TitleBar", () => {
  it("shows the connection prefix but not the trailing database name", () => {
    render(<TitleBar {...baseProps} />);
    expect(screen.getByText("postgres://postgres:***@localhost:5432")).toBeInTheDocument();
    expect(screen.queryByText("qyre_demo")).not.toBeInTheDocument();
  });

  it("keeps the status text in the accessibility tree but visually hidden", () => {
    render(<TitleBar {...baseProps} />);
    const summary = screen.getByTestId("connection-summary");
    expect(summary).toHaveTextContent("Connected");
    expect(summary).toHaveClass("sr-only");
  });

  it("falls back to showing the whole target when it has no path segment to split off", () => {
    render(<TitleBar {...baseProps} target="app.db" />);
    expect(screen.getByText("app.db")).toBeInTheDocument();
  });
});
