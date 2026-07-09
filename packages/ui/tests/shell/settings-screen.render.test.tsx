import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsScreen, type QyreSettings } from "../../src/shell/settings-screen.js";

const BASE_SETTINGS: QyreSettings = {
  theme: "dark",
  schemaView: "graph",
  sidebarWidth: 256,
  resultsHeight: 256
};

function renderScreen(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    settings: BASE_SETTINGS,
    onSave: vi.fn(),
    onClose: vi.fn(),
    connectionStatus: "connected" as const,
    connectionTarget: "postgres://localhost/qyre_demo",
    onOpenConnection: vi.fn(),
    queryHistoryCount: 3,
    onClearQueryHistory: vi.fn(),
    recentConnectionsCount: 2,
    onClearRecentConnections: vi.fn(),
    ...overrides
  };
  render(<SettingsScreen {...props} />);
  return props;
}

describe("SettingsScreen", () => {
  it("starts clean and disables save until a setting is staged", () => {
    renderScreen();

    expect(screen.getByText("All changes saved")).toBeVisible();
    expect(screen.getByTestId("settings-save")).toBeDisabled();
  });

  it("stages a change without applying it, then saves the whole draft at once", () => {
    const { onSave } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    // Staged, not applied - the dirty banner shows and Save is enabled.
    expect(screen.getByTestId("settings-dirty-badge")).toHaveTextContent("Unsaved changes");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("settings-save"));
    expect(onSave).toHaveBeenCalledWith({ ...BASE_SETTINGS, theme: "light" });
  });

  it("discards staged edits back to the applied baseline", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(screen.getByTestId("settings-dirty-badge")).toHaveTextContent("Unsaved changes");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByText("All changes saved")).toBeVisible();
    expect(screen.getByTestId("settings-save")).toBeDisabled();
  });

  it("clamps numeric fields to their bounds", () => {
    const { onSave } = renderScreen();

    const widthInput = screen.getByLabelText("Sidebar width in pixels");
    fireEvent.change(widthInput, { target: { value: "9999" } });
    fireEvent.click(screen.getByTestId("settings-save"));

    expect(onSave).toHaveBeenCalledWith({ ...BASE_SETTINGS, sidebarWidth: 480 });
  });

  it("clears locally-stored lists and disables the control when empty", () => {
    const { onClearQueryHistory } = renderScreen({ recentConnectionsCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Clear query history" }));
    expect(onClearQueryHistory).toHaveBeenCalledTimes(1);

    // Recent connections is empty, so its Clear is disabled.
    expect(screen.getByRole("button", { name: "Clear recent connections" })).toBeDisabled();
  });

  it("surfaces the current connection and routes to the switcher", () => {
    const { onOpenConnection } = renderScreen();

    expect(screen.getByText("postgres://localhost/qyre_demo")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Switch/ }));
    expect(onOpenConnection).toHaveBeenCalledTimes(1);
  });
});
