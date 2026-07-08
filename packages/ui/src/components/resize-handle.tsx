import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface ResizeHandleProps {
  /** "vertical" = a vertical divider line, dragged left/right (sidebar width); "horizontal" = a
   * horizontal divider line, dragged up/down (editor/results split). */
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Amount an arrow-key press adjusts `value` by. Pointer-drag always tracks the cursor exactly;
   * this only affects keyboard step size. */
  step?: number;
  /** True when the controlled panel sits on the side of the handle where the pointer axis
   * decreases as the panel grows (e.g. a bottom panel whose handle is on its top edge - dragging
   * the handle up, a negative Y delta, should grow it). Sidebar (handle trailing a left-anchored
   * panel) is the default, non-inverted case. */
  invert?: boolean;
  "aria-label": string;
}

/**
 * A draggable divider between two panels (F071): pointer-drag resizes continuously, and - since a
 * plain drag handle is invisible to keyboard/screen-reader users - it's also focusable and
 * responds to arrow keys, following the WAI-ARIA "window splitter" separator pattern
 * (role="separator" + aria-orientation/valuenow/valuemin/valuemax on a focusable element, not an
 * <input type="range"> since this moves a boundary between two regions, not a standalone value).
 */
export function ResizeHandle({
  orientation,
  value,
  min,
  max,
  onChange,
  step = 16,
  invert = false,
  "aria-label": ariaLabel
}: ResizeHandleProps): ReactNode {
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ pointerPos: 0, startValue: 0 });

  useEffect(() => {
    function clamp(next: number): number {
      return Math.min(max, Math.max(min, next));
    }

    function onPointerMove(event: globalThis.PointerEvent): void {
      if (!draggingRef.current) return;
      const pointerPos = orientation === "vertical" ? event.clientX : event.clientY;
      const delta = pointerPos - dragStartRef.current.pointerPos;
      onChange(clamp(dragStartRef.current.startValue + (invert ? -delta : delta)));
    }
    function onPointerUp(): void {
      draggingRef.current = false;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [orientation, min, max, invert, onChange]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    draggingRef.current = true;
    dragStartRef.current = {
      pointerPos: orientation === "vertical" ? event.clientX : event.clientY,
      startValue: value
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const decreaseKey = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const increaseKey = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (event.key === decreaseKey) {
      onChange(Math.max(min, value - step));
      event.preventDefault();
    } else if (event.key === increaseKey) {
      onChange(Math.min(max, value + step));
      event.preventDefault();
    }
  }

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={
        orientation === "vertical"
          ? "h-full w-1 shrink-0 cursor-col-resize bg-border outline-none hover:bg-primary/50 focus-visible:bg-primary"
          : "w-full h-1 shrink-0 cursor-row-resize bg-border outline-none hover:bg-primary/50 focus-visible:bg-primary"
      }
    />
  );
}
