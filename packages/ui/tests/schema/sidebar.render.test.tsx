import type { SchemaMetadata } from "@qyre/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../src/schema/sidebar.js";

const BASE_PROPS = {
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

describe("Sidebar schema management (F116)", () => {
  const schemas: SchemaMetadata[] = [{ name: "public", tables: ["users"] }];

  it("creates a schema via the New-schema dialog and closes it on success", async () => {
    const onCreateSchema = vi.fn().mockResolvedValue(undefined);
    render(
      <Sidebar {...BASE_PROPS} schemas={schemas} canManageSchemas onCreateSchema={onCreateSchema} />
    );
    fireEvent.click(screen.getByText("New schema"));
    const dialog = screen.getByTestId("create-named-dialog");
    fireEvent.change(within(dialog).getByLabelText("Schema name"), {
      target: { value: "reporting" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreateSchema).toHaveBeenCalledWith("reporting"));
    await waitFor(() =>
      expect(screen.queryByTestId("create-named-dialog")).not.toBeInTheDocument()
    );
  });

  it("drops a schema via typed confirmation", async () => {
    const onDropSchema = vi.fn().mockResolvedValue(undefined);
    render(
      <Sidebar {...BASE_PROPS} schemas={schemas} canManageSchemas onDropSchema={onDropSchema} />
    );
    fireEvent.click(screen.getByLabelText("Drop schema public"));
    const dialog = screen.getByTestId("confirm-typed-name-dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("public"), {
      target: { value: "public" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Drop schema" }));

    await waitFor(() => expect(onDropSchema).toHaveBeenCalledWith("public"));
  });

  it("shows the create-schema error inline on failure", async () => {
    const onCreateSchema = vi
      .fn()
      .mockRejectedValue(new Error("A schema named reporting already exists."));
    render(
      <Sidebar {...BASE_PROPS} schemas={schemas} canManageSchemas onCreateSchema={onCreateSchema} />
    );
    fireEvent.click(screen.getByText("New schema"));
    const dialog = screen.getByTestId("create-named-dialog");
    fireEvent.change(within(dialog).getByLabelText("Schema name"), {
      target: { value: "reporting" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByText("A schema named reporting already exists.")).toBeInTheDocument();
  });

  it("hides schema controls when canManageSchemas is false", () => {
    render(<Sidebar {...BASE_PROPS} schemas={schemas} canManageSchemas={false} />);
    expect(screen.queryByText("New schema")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drop schema public")).not.toBeInTheDocument();
  });
});
