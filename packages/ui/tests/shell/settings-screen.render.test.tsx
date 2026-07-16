import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "../../src/shell/settings-screen.js";

function renderScreen(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    theme: "dark" as const,
    onThemeChange: vi.fn(),
    onClose: vi.fn(),
    connectionStatus: "connected" as const,
    connectionTarget: "postgres://localhost/qyre_test",
    onOpenConnection: vi.fn(),
    queryHistoryCount: 3,
    onClearQueryHistory: vi.fn(),
    recentConnectionsCount: 2,
    onClearRecentConnections: vi.fn(),
    accessSupported: true,
    accessOverview: {
      identity: "app_user",
      roles: [{ name: "reader", isCurrent: true, attributes: ["login"] }],
      grants: ["SELECT on public.users"],
      facts: [{ label: "Session user", value: "app_user" }],
      notices: []
    },
    accessLoading: false,
    accessError: false,
    onRetryAccess: vi.fn(),
    ...overrides
  };
  render(<SettingsScreen {...props} />);
  return props;
}

describe("SettingsScreen", () => {
  it("applies a theme change immediately, with no save/discard step", () => {
    const { onThemeChange } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(onThemeChange).toHaveBeenCalledWith("light");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });

  it("reflects the given theme as the pressed segment", () => {
    renderScreen({ theme: "light" });

    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clears locally-stored lists and disables the control when empty", () => {
    const { onClearQueryHistory } = renderScreen({ recentConnectionsCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Data & history" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear query history" }));
    expect(onClearQueryHistory).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("button", { name: "Clear recent connections" })).toBeDisabled();
  });

  it("surfaces the current connection and routes to the switcher", () => {
    const { onOpenConnection } = renderScreen();

    expect(screen.getByText("postgres://localhost/qyre_test")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Switch/ }));
    expect(onOpenConnection).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const { onClose } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("centers the top-aligned preference column within the workspace pane", () => {
    renderScreen();

    const section = screen
      .getByRole("heading", { name: "Connection", level: 3 })
      .closest("section");
    expect(section?.parentElement).toHaveClass("mx-auto", "max-w-4xl");
  });

  it("renders access identity, roles, grants, and facts", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Access" }));
    expect(screen.getAllByText("app_user")).toHaveLength(2);
    expect(screen.getByText("reader")).toBeVisible();
    expect(screen.getByText("SELECT on public.users")).toBeVisible();
    expect(screen.getByText("Session user")).toBeVisible();
  });
});
