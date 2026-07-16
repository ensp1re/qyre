import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorPopover } from "../../src/data-grid/editing/editor-popover.js";

describe("EditorPopover (component rendering, F146)", () => {
  it("keeps the editor open for internal scrolling and dismisses when the anchor's container scrolls", () => {
    const onDismiss = vi.fn();
    render(
      <EditorPopover
        anchorRect={new DOMRect(10, 10, 80, 20)}
        testId="popover"
        onDismiss={onDismiss}
      >
        <div data-testid="editor-scroll-area">content</div>
      </EditorPopover>
    );

    screen.getByTestId("editor-scroll-area").dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(onDismiss).not.toHaveBeenCalled();

    const anchorScrollContainer = document.createElement("div");
    document.body.appendChild(anchorScrollContainer);
    anchorScrollContainer.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(onDismiss).toHaveBeenCalledOnce();
    anchorScrollContainer.remove();
  });

  it("does not throw when onDismiss is omitted", () => {
    render(
      <EditorPopover anchorRect={new DOMRect(10, 10, 80, 20)} testId="popover">
        <div>content</div>
      </EditorPopover>
    );
    expect(() =>
      document.body.dispatchEvent(new Event("scroll", { bubbles: false }))
    ).not.toThrow();
  });
});
