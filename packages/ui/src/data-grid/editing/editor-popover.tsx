import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;
const EDITOR_WIDTH = 512;
const PREFERRED_HEIGHT = 360;

export function editorPopoverPosition(rect: DOMRect): CSSProperties {
  const width = Math.min(EDITOR_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
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
}

/** A grid-safe editor surface. Portalling prevents table overflow and sticky headers from clipping
 * the editor; viewport collision keeps every action reachable in narrow or short windows. */
export function EditorPopover({ anchorRect, children, testId }: EditorPopoverProps): ReactNode {
  return createPortal(
    <div
      data-testid={testId}
      className="fixed z-[80] overflow-auto rounded-[4px] border border-primary bg-popover shadow-lg"
      style={editorPopoverPosition(anchorRect)}
    >
      {children}
    </div>,
    document.body
  );
}
