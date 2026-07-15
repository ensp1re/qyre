import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;
const EDITOR_WIDTH = 512;
const PREFERRED_HEIGHT = 360;

export function editorPopoverPosition(rect: DOMRect, preferredWidth = EDITOR_WIDTH): CSSProperties {
  const width = Math.min(preferredWidth, window.innerWidth - VIEWPORT_MARGIN * 2);
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN)
  );
  const below = window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const above = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN;
  const openAbove = below < Math.min(PREFERRED_HEIGHT, above) && above > below;

  return {
    left,
    width,
    maxHeight: Math.max(0, openAbove ? above : below),
    top: openAbove ? undefined : rect.bottom + ANCHOR_GAP,
    bottom: openAbove ? window.innerHeight - rect.top + ANCHOR_GAP : undefined
  };
}

export interface EditorPopoverProps {
  anchorRect: DOMRect;
  children: ReactNode;
  testId?: string;
  /** Overrides the popover's default width (F146) - the timestamp mini-picker uses a narrower one
   * so it reads as attached to a compact column instead of a large disconnected form. */
  width?: number;
  /** Called when the anchor's scroll container scrolls (F146) - `anchorRect` is measured once at
   * open time and this is `position: fixed`, so it can't track the anchor cell moving under a
   * virtualized table's own scroll; closing on scroll avoids the popover visibly detaching from
   * its cell instead of trying to keep repositioning it every frame. */
  onDismiss?: () => void;
}

/** A grid-safe editor surface. Portalling prevents table overflow and sticky headers from clipping
 * the editor; viewport collision keeps every action reachable in narrow or short windows. */
export function EditorPopover({
  anchorRect,
  children,
  testId,
  width,
  onDismiss
}: EditorPopoverProps): ReactNode {
  useEffect(() => {
    if (!onDismiss) return;
    // `scroll` doesn't bubble, but a capture-phase listener on `window` still sees it fire on any
    // descendant scrollable container (the virtualized table's own scroll area included).
    window.addEventListener("scroll", onDismiss, true);
    return () => window.removeEventListener("scroll", onDismiss, true);
  }, [onDismiss]);

  return createPortal(
    <div
      data-testid={testId}
      className="fixed z-[80] overflow-auto rounded-[4px] border border-primary bg-popover shadow-lg"
      style={editorPopoverPosition(anchorRect, width)}
    >
      {children}
    </div>,
    document.body
  );
}
