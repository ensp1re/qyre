import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateNamedDialog } from "../../src/primitives/create-named-dialog.js";

describe("CreateNamedDialog (component rendering, F116)", () => {
  it("disables Create until the name is a valid identifier", () => {
    render(
      <CreateNamedDialog
        title="New database"
        label="Database name"
        creating={false}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Database name"), { target: { value: "1bad" } });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Database name"), { target: { value: "analytics" } });
    expect(createButton).not.toBeDisabled();
  });

  it("calls onCreate with the typed name", () => {
    const onCreate = vi.fn();
    render(
      <CreateNamedDialog
        title="New schema"
        label="Schema name"
        creating={false}
        onCreate={onCreate}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Schema name"), { target: { value: "reporting" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith("reporting");
  });

  it("shows the create error inline without closing", () => {
    render(
      <CreateNamedDialog
        title="New database"
        label="Database name"
        creating={false}
        error='A database named "analytics" already exists.'
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('A database named "analytics" already exists.')).toBeInTheDocument();
  });

  it("calls onClose on Cancel and Escape", () => {
    const onClose = vi.fn();
    render(
      <CreateNamedDialog
        title="New database"
        label="Database name"
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

  it("disables Create and Cancel while creating", () => {
    render(
      <CreateNamedDialog
        title="New database"
        label="Database name"
        creating
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
