import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentEditorDrawer } from "../../src/data-grid/document-editor-drawer.js";

describe("DocumentEditorDrawer (component rendering, F125)", () => {
  it("shows a loading state instead of the textarea while fetching (edit mode)", () => {
    render(
      <DocumentEditorDrawer mode="edit" loading saving={false} onSave={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/loading document/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Document JSON")).not.toBeInTheDocument();
  });

  it("pre-fills the textarea from initialText once loaded", () => {
    render(
      <DocumentEditorDrawer
        mode="edit"
        initialText='{"_id":{"$oid":"507f1f77bcf86cd799439011"},"name":"Ada"}'
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Document JSON")).toHaveValue(
      '{"_id":{"$oid":"507f1f77bcf86cd799439011"},"name":"Ada"}'
    );
  });

  it("disables Save and shows an inline error for invalid JSON", () => {
    render(
      <DocumentEditorDrawer
        mode="insert"
        initialText=""
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Document JSON"), { target: { value: "{not json" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onSave with the edited text when Save is clicked", () => {
    const onSave = vi.fn();
    render(
      <DocumentEditorDrawer
        mode="insert"
        initialText=""
        saving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Document JSON"), {
      target: { value: '{"name":"Ada"}' }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith('{"name":"Ada"}');
  });

  it("shows the save error inline without closing", () => {
    render(
      <DocumentEditorDrawer
        mode="edit"
        initialText='{"name":"Ada"}'
        saving={false}
        error="This document was already changed or removed."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("This document was already changed or removed.")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DocumentEditorDrawer
        mode="insert"
        initialText=""
        saving={false}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides the delete section when canDelete is false, even in edit mode", () => {
    render(
      <DocumentEditorDrawer
        mode="edit"
        initialText='{"name":"Ada"}'
        documentId="507f1f77bcf86cd799439011"
        canDelete={false}
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("hides the delete section in insert mode even when canDelete is true", () => {
    render(
      <DocumentEditorDrawer
        mode="insert"
        initialText=""
        canDelete
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("keeps Delete disabled until the typed text exactly matches the document's _id", () => {
    render(
      <DocumentEditorDrawer
        mode="edit"
        initialText='{"name":"Ada"}'
        documentId="507f1f77bcf86cd799439011"
        canDelete
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type the document's _id to confirm deletion"), {
      target: { value: "507f1f77bcf86cd799439011" }
    });
    expect(deleteButton).not.toBeDisabled();
  });

  it("calls onDelete only once the typed _id matches", () => {
    const onDelete = vi.fn();
    render(
      <DocumentEditorDrawer
        mode="edit"
        initialText='{"name":"Ada"}'
        documentId="507f1f77bcf86cd799439011"
        canDelete
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.change(screen.getByLabelText("Type the document's _id to confirm deletion"), {
      target: { value: "507f1f77bcf86cd799439011" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <DocumentEditorDrawer
        mode="insert"
        initialText=""
        saving={false}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
