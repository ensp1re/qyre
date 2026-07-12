import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDestructiveStatementDialog } from "../../src/query/confirm-destructive-statement-dialog.js";

describe("ConfirmDestructiveStatementDialog (F108)", () => {
  it("shows the classification and the exact SQL text", () => {
    render(
      <ConfirmDestructiveStatementDialog
        sql="DROP TABLE users"
        classification="destructive"
        running={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId("statement-classification")).toHaveTextContent("destructive");
    expect(screen.getByText("DROP TABLE users")).toBeInTheDocument();
  });

  it("calls onConfirm when 'Run anyway' is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDestructiveStatementDialog
        sql="DELETE FROM users"
        classification="destructive"
        running={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Run anyway" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDestructiveStatementDialog
        sql="DELETE FROM users"
        classification="destructive"
        running={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDestructiveStatementDialog
        sql="DELETE FROM users"
        classification="destructive"
        running={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables both buttons while running", () => {
    render(
      <ConfirmDestructiveStatementDialog
        sql="DELETE FROM users"
        classification="destructive"
        running={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Running..." })).toBeDisabled();
  });
});
