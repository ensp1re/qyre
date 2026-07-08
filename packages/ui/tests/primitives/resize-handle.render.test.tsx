import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "../../src/primitives/resize-handle.js";

function getHandle(): HTMLElement {
  return screen.getByRole("separator");
}

describe("ResizeHandle", () => {
  it("exposes ARIA separator attributes for the current value/range", () => {
    render(
      <ResizeHandle
        orientation="vertical"
        value={256}
        min={180}
        max={480}
        onChange={vi.fn()}
        aria-label="Resize sidebar"
      />
    );
    const handle = getHandle();
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "256");
    expect(handle).toHaveAttribute("aria-valuemin", "180");
    expect(handle).toHaveAttribute("aria-valuemax", "480");
    expect(handle).toHaveAttribute("aria-label", "Resize sidebar");
    expect(handle).toHaveAttribute("tabindex", "0");
  });

  it("ArrowRight/ArrowLeft adjust a vertical handle's value by the step, clamped to min/max", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="vertical"
        value={256}
        min={180}
        max={480}
        step={16}
        onChange={onChange}
        aria-label="Resize sidebar"
      />
    );
    fireEvent.keyDown(getHandle(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(272);
    fireEvent.keyDown(getHandle(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(240);
  });

  it("clamps keyboard adjustment at min/max", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="vertical"
        value={185}
        min={180}
        max={480}
        step={16}
        onChange={onChange}
        aria-label="Resize sidebar"
      />
    );
    fireEvent.keyDown(getHandle(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(180);
  });

  it("ArrowUp/ArrowDown (not ArrowLeft/ArrowRight) adjust a horizontal handle", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="horizontal"
        value={256}
        min={120}
        max={600}
        step={16}
        onChange={onChange}
        aria-label="Resize results panel"
      />
    );
    fireEvent.keyDown(getHandle(), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(getHandle(), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(272);
  });

  it("pointer drag reports the new value continuously, direction matching the axis", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="vertical"
        value={256}
        min={180}
        max={480}
        onChange={onChange}
        aria-label="Resize sidebar"
      />
    );
    fireEvent.pointerDown(getHandle(), { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 150 });
    expect(onChange).toHaveBeenLastCalledWith(306);
    fireEvent.pointerMove(window, { clientX: 90 });
    expect(onChange).toHaveBeenLastCalledWith(246);
  });

  it("invert flips the pointer-drag direction (e.g. a bottom panel whose handle is on its top edge)", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="horizontal"
        value={256}
        min={120}
        max={600}
        onChange={onChange}
        invert
        aria-label="Resize results panel"
      />
    );
    fireEvent.pointerDown(getHandle(), { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 60 });
    expect(onChange).toHaveBeenLastCalledWith(296);
  });

  it("stops reporting drag movement after pointer up", () => {
    const onChange = vi.fn();
    render(
      <ResizeHandle
        orientation="vertical"
        value={256}
        min={180}
        max={480}
        onChange={onChange}
        aria-label="Resize sidebar"
      />
    );
    fireEvent.pointerDown(getHandle(), { clientX: 100 });
    fireEvent.pointerUp(window);
    onChange.mockClear();
    fireEvent.pointerMove(window, { clientX: 200 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
