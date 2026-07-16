import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommandToolbar } from "../../../src/primitives/controls/command-toolbar.js";

describe("CommandToolbar", () => {
  it("exposes the toolbar and its name", () => {
    render(
      <CommandToolbar label="Table commands">
        <button data-command-item>Refresh</button>
      </CommandToolbar>
    );
    expect(screen.getByRole("toolbar", { name: "Table commands" })).toBeInTheDocument();
  });

  it("moves focus between visible commands with arrow keys", () => {
    render(
      <CommandToolbar label="Table commands">
        <button data-command-item>First</button>
        <button data-command-item>Second</button>
      </CommandToolbar>
    );
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    Object.defineProperty(first, "offsetParent", { configurable: true, value: document.body });
    Object.defineProperty(second, "offsetParent", { configurable: true, value: document.body });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
  });
});
