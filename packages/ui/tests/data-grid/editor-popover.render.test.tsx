import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorPopover } from "../../src/data-grid/editing/editor-popover.js";

describe("EditorPopover (component rendering, F146)", () => {
  it("calls onDismiss when a descendant scroll container scrolls, since a fixed-position popover can't track the anchor otherwise", () => {
    const onDismiss = vi.fn();
    render(
      <EditorPopover
        anchorRect={new DOMRect(10, 10, 80, 20)}
        testId="popover"
        onDismiss={onDismiss}
      >
        <div>content</div>
      </EditorPopover>
    );

    const scrollable = document.createElement("div");
    document.body.appendChild(scrollable);
    scrollable.dispatchEvent(new Event("scroll", { bubbles: false }));

    expect(onDismiss).toHaveBeenCalledOnce();
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
