import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CircleX } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../src/primitives/controls/button.js";
import { Field } from "../../src/primitives/controls/field.js";
import { IconButton } from "../../src/primitives/controls/icon-button.js";
import { Select } from "../../src/primitives/controls/select.js";

const options = [
  { value: "csv", label: "CSV" },
  { value: "sql", label: "SQL INSERT", disabled: true },
  { value: "json", label: "JSON" }
] as const;

function SelectHost(): React.ReactNode {
  const [value, setValue] = useState("csv");
  return <Select label="Export format" value={value} options={options} onValueChange={setValue} />;
}

describe("shared controls", () => {
  it("disables and exposes progress while a button is loading", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
  });

  it("requires an accessible label for an icon-only action", () => {
    render(<IconButton label="Close editor" icon={<CircleX />} />);
    expect(screen.getByRole("button", { name: "Close editor" })).toHaveAttribute(
      "title",
      "Close editor"
    );
  });

  it("connects a field label, description, and error to its control", () => {
    render(
      <Field label="Amount" description="Exact decimal text." error="Enter a valid number.">
        <input />
      </Field>
    );
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const described = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(described).toHaveLength(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Exact decimal text.",
      "Enter a valid number."
    ]);
  });

  it("navigates the custom select by keyboard and skips disabled options", () => {
    render(<SelectHost />);
    const trigger = screen.getByRole("combobox", { name: "Export format" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "JSON" }).id
    );
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveTextContent("JSON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports Home, End, typeahead, and Escape with focus restoration", async () => {
    render(<SelectHost />);
    const trigger = screen.getByRole("combobox", { name: "Export format" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "JSON" }).id
    );
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "CSV" }).id
    );
    fireEvent.keyDown(trigger, { key: "j" });
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "JSON" }).id
    );
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("ignores disabled custom-select options", () => {
    const onValueChange = vi.fn();
    render(
      <Select label="Export format" value="csv" options={options} onValueChange={onValueChange} />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Export format" }));
    const disabled = screen.getByRole("option", { name: "SQL INSERT" });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
