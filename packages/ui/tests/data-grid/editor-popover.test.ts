import { afterEach, describe, expect, it } from "vitest";
import { editorPopoverPosition } from "../../src/data-grid/editing/editor-popover.js";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

afterEach(() => setViewport(originalWidth, originalHeight));

describe("editorPopoverPosition", () => {
  it("keeps the editor inside the right viewport edge", () => {
    setViewport(640, 720);

    const position = editorPopoverPosition(new DOMRect(550, 200, 80, 24));

    expect(position).toMatchObject({ left: 120, width: 512, top: 228, maxHeight: 484 });
  });

  it("opens above anchors near the bottom edge", () => {
    setViewport(640, 720);

    const position = editorPopoverPosition(new DOMRect(200, 650, 80, 24));

    expect(position).toMatchObject({ left: 120, width: 512, bottom: 74, maxHeight: 638 });
    expect(position.top).toBeUndefined();
  });

  it("uses only available height in a short viewport", () => {
    setViewport(200, 100);

    const position = editorPopoverPosition(new DOMRect(20, 45, 40, 10));

    expect(position).toMatchObject({ left: 8, width: 184, top: 59, maxHeight: 33 });
  });
});
