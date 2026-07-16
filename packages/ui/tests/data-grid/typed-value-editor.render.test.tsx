import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypedValueEditor } from "../../src/data-grid/editing/typed-value-editor.js";

describe("TypedValueEditor", () => {
  it("reports JSON syntax location and preserves the draft", () => {
    const onApply = vi.fn();
    render(
      <TypedValueEditor
        column={{ name: "payload", dataType: "jsonb", nullable: false }}
        engine="postgres"
        originalValue={{ active: true }}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    const textarea = screen.getByLabelText("New value");
    fireEvent.change(textarea, { target: { value: '{\n  "active":\n}' } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/line 3/i)).toBeInTheDocument();
    expect(textarea).toHaveValue('{\n  "active":\n}');
  });

  it("formats and applies a JSON object exactly once", () => {
    const onApply = vi.fn();
    render(
      <TypedValueEditor
        column={{ name: "payload", dataType: "json", nullable: false }}
        engine="sqlite"
        originalValue='{"count":1}'
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(screen.getByLabelText("New value")).toHaveValue('{\n  "count": 1\n}');
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ count: 1 });
  });

  it("applies a PostgreSQL array as a native array", () => {
    const onApply = vi.fn();
    render(
      <TypedValueEditor
        column={{
          name: "tags",
          dataType: "text[]",
          nullable: false,
          elementDataType: "text"
        }}
        engine="postgres"
        originalValue={["one"]}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("New value"), {
      target: { value: '["one","two"]' }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(["one", "two"]);
  });

  it("uses a custom SET checklist control from column metadata", () => {
    const setApply = vi.fn();
    render(
      <TypedValueEditor
        column={{
          name: "flags",
          dataType: "set('one','two')",
          nullable: false,
          allowedValues: ["one", "two"]
        }}
        engine="mysql"
        originalValue={["one"]}
        onApply={setApply}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "two" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(setApply).toHaveBeenCalledWith(["one", "two"]);
  });

  it("keeps drawer utilities and actions visible around a bounded JSON editor", () => {
    render(
      <TypedValueEditor
        column={{ name: "payload", dataType: "jsonb", nullable: false }}
        engine="postgres"
        originalValue={{ active: true }}
        presentation="drawer"
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("disables drawer Apply while binary hex is invalid", () => {
    const onApply = vi.fn();
    render(
      <TypedValueEditor
        column={{ name: "payload", dataType: "bytea", nullable: false }}
        engine="postgres"
        originalValue={{ type: "Buffer", data: [0, 255] }}
        presentation="drawer"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    const editor = screen.getByLabelText("Edit cell value");
    fireEvent.change(editor, { target: { value: "0fg" } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.change(editor, { target: { value: "0f" } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });
});
