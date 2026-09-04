import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
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
  width?: number;
  onDismiss?: () => void;
}

export function EditorPopover({
  anchorRect,
  children,
  testId,
  width,
  onDismiss
}: EditorPopoverProps): ReactNode {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onDismiss) return;
    const dismissFromExternalScroll = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      onDismiss();
    };
    // Capture scroll events from nested containers so the anchored editor stays current.
    window.addEventListener("scroll", dismissFromExternalScroll, true);
    return () => window.removeEventListener("scroll", dismissFromExternalScroll, true);
  }, [onDismiss]);

  return createPortal(
    <div
      ref={popoverRef}
      data-testid={testId}
      className="fixed z-[80] overflow-auto rounded-[4px] border border-primary bg-popover shadow-lg"
      style={editorPopoverPosition(anchorRect, width)}
    >
      {children}
    </div>,
    document.body
  );
}
