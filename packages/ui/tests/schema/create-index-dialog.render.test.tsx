import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateIndexDialog } from "../../src/schema/dialogs/create-index-dialog.js";

describe("CreateIndexDialog (component rendering, F114)", () => {
  it("disables Create index until a name and at least one column are chosen", () => {
    render(
      <CreateIndexDialog
        table="orders"
        availableColumns={["id", "email"]}
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const createButton = screen.getByRole("button", { name: "Create index" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Index name"), {
      target: { value: "orders_email_idx" }
    });
    expect(createButton).toBeDisabled();

    fireEvent.click(screen.getByText("email"));
    expect(createButton).not.toBeDisabled();
  });

  it("calls onCreate with the selected columns and unique flag", () => {
    const onCreate = vi.fn();
    render(
      <CreateIndexDialog
        table="orders"
        availableColumns={["id", "email"]}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Index name"), {
      target: { value: "orders_email_idx" }
    });
    fireEvent.click(screen.getByText("email"));
    fireEvent.click(screen.getByText("Unique"));
    fireEvent.click(screen.getByRole("button", { name: "Create index" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "orders_email_idx",
      columns: ["email"],
      unique: true
    });
  });

  it("toggles a column off when clicked again", () => {
    const onCreate = vi.fn();
    render(
      <CreateIndexDialog
        table="orders"
        availableColumns={["id", "email"]}
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Index name"), { target: { value: "idx" } });
    fireEvent.click(screen.getByText("id"));
    fireEvent.click(screen.getByText("email"));
    fireEvent.click(screen.getByText("id"));
    fireEvent.click(screen.getByRole("button", { name: "Create index" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "idx", columns: ["email"], unique: false });
  });

  it("closes on Escape and Cancel", () => {
    const onClose = vi.fn();
    render(
      <CreateIndexDialog
        table="orders"
        availableColumns={["id"]}
        creating={false}
        onCreate={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
