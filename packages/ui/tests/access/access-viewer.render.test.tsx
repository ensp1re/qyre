import type { AccessOverview } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessViewer, type AccessViewerProps } from "../../src/access/access-viewer.js";

const overview: AccessOverview = {
  identity: "app_user",
  roles: [],
  grants: [],
  facts: [],
  notices: []
};

function renderViewer(overrides: Partial<AccessViewerProps> = {}) {
  const props: AccessViewerProps = {
    connectionStatus: "connected",
    supported: true,
    overview,
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    ...overrides
  };
  render(<AccessViewer {...props} />);
  return props;
}

describe("AccessViewer", () => {
  it("shows explicit empty states", () => {
    renderViewer();
    expect(screen.getByText("No database roles are active or visible.")).toBeVisible();
    expect(screen.getByText("No grants are visible for this connection.")).toBeVisible();
    expect(screen.getByText("No additional access facts are available.")).toBeVisible();
  });

  it("shows disconnected and unsupported states", () => {
    const { rerender } = render(
      <AccessViewer
        connectionStatus="disconnected"
        supported={false}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Connect to a database/)).toBeVisible();
    rerender(
      <AccessViewer
        connectionStatus="connected"
        supported={false}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/does not expose access inspection/)).toBeVisible();
  });

  it("shows loading and retries errors", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <AccessViewer
        connectionStatus="connected"
        supported
        isLoading
        isError={false}
        onRetry={onRetry}
      />
    );
    expect(screen.getByText(/Inspecting roles and grants/)).toBeVisible();
    rerender(
      <AccessViewer
        connectionStatus="connected"
        supported
        isLoading={false}
        isError
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
