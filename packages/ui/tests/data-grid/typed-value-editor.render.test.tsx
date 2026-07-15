import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypedValueEditor } from "../../src/data-grid/editing/typed-value-editor.js";
import { chooseSelect } from "../support/select.js";

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
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Format JSON" }));
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

  it("uses custom enum and SET controls from column metadata", () => {
    const enumApply = vi.fn();
    const { unmount } = render(
      <TypedValueEditor
        column={{
          name: "status",
          dataType: "status_enum",
          nullable: false,
          allowedValues: ["draft", "ready"]
        }}
        engine="postgres"
        originalValue="draft"
        onApply={enumApply}
        onCancel={vi.fn()}
      />
    );
    chooseSelect("Edit cell value", "ready");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(enumApply).toHaveBeenCalledWith("ready");
    unmount();

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
});
