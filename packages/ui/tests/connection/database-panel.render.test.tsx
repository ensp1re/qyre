import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatabasePanel, type DatabasePanelProps } from "../../src/connection/database-panel.js";

function makeProps(overrides: Partial<DatabasePanelProps> = {}): DatabasePanelProps {
  return {
    databases: ["app", "analytics"],
    loading: false,
    currentDatabase: "app",
    canManage: true,
    onSwitch: vi.fn().mockResolvedValue(undefined),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onDrop: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("DatabasePanel (component rendering, F116)", () => {
  it("marks the current database and offers Switch on the others", () => {
    render(<DatabasePanel {...makeProps()} />);
    const list = screen.getByText("app").closest("li");
    expect(list).toHaveTextContent("current");
    expect(screen.getByLabelText("Switch to analytics")).toBeInTheDocument();
    expect(screen.queryByLabelText("Switch to app")).not.toBeInTheDocument();
  });

  it("calls onSwitch when Switch is clicked", async () => {
    const onSwitch = vi.fn().mockResolvedValue(undefined);
    render(<DatabasePanel {...makeProps({ onSwitch })} />);
    fireEvent.click(screen.getByLabelText("Switch to analytics"));
    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith("analytics"));
  });

  it("shows the switch error inline on failure", async () => {
    const onSwitch = vi.fn().mockRejectedValue(new Error("Connection refused."));
    render(<DatabasePanel {...makeProps({ onSwitch })} />);
    fireEvent.click(screen.getByLabelText("Switch to analytics"));
    expect(await screen.findByText("Connection refused.")).toBeInTheDocument();
  });

  it("hides New database and drop buttons when canManage is false", () => {
    render(<DatabasePanel {...makeProps({ canManage: false })} />);
    expect(screen.queryByText("New database")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drop database analytics")).not.toBeInTheDocument();
  });

  it("shows the hidden reason when canManage is false and a reason is given", () => {
    render(
      <DatabasePanel
        {...makeProps({ canManage: false, hiddenReason: "Qyre was started with --read-only." })}
      />
    );
    expect(screen.getByText(/Qyre was started with --read-only\./)).toBeInTheDocument();
  });

  it("creates a database via the New-database dialog and closes it on success", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<DatabasePanel {...makeProps({ onCreate })} />);
    fireEvent.click(screen.getByText("New database"));
    const dialog = screen.getByTestId("create-named-dialog");
    fireEvent.change(within(dialog).getByLabelText("Database name"), {
      target: { value: "reporting" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("reporting"));
    await waitFor(() =>
      expect(screen.queryByTestId("create-named-dialog")).not.toBeInTheDocument()
    );
  });

  it("drops a database via typed confirmation", async () => {
    const onDrop = vi.fn().mockResolvedValue(undefined);
    render(<DatabasePanel {...makeProps({ onDrop })} />);
    fireEvent.click(screen.getByLabelText("Drop database analytics"));
    const dialog = screen.getByTestId("confirm-typed-name-dialog");
    const dropButton = within(dialog).getByRole("button", { name: "Drop database" });
    expect(dropButton).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("analytics"), {
      target: { value: "analytics" }
    });
    fireEvent.click(dropButton);

    await waitFor(() => expect(onDrop).toHaveBeenCalledWith("analytics"));
  });

  it("shows a loading state and no list while loading", () => {
    render(<DatabasePanel {...makeProps({ loading: true, databases: undefined })} />);
    expect(screen.getByText("Loading databases...")).toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });
});
