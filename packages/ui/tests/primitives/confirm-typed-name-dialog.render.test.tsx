import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmTypedNameDialog } from "../../src/primitives/confirm-typed-name-dialog.js";

describe("ConfirmTypedNameDialog (component rendering, F114)", () => {
  it("disables the confirm button until the typed text matches the target name", () => {
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const confirmButton = screen.getByRole("button", { name: "Drop table" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("orders"), { target: { value: "wrong" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("orders"), { target: { value: "orders" } });
    expect(confirmButton).not.toBeDisabled();
  });

  it("calls onConfirm only once the typed text matches", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("orders"), { target: { value: "orders" } });
    fireEvent.click(screen.getByRole("button", { name: "Drop table" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows the error inline without closing", () => {
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy={false}
        error="Cannot drop a table with active connections."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Cannot drop a table with active connections.")).toBeInTheDocument();
  });

  it("disables Cancel and the confirm button while busy", () => {
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Drop table/ })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ConfirmTypedNameDialog
        title="Drop table"
        description="Type the name to confirm."
        targetName="orders"
        confirmLabel="Drop table"
        busy={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
