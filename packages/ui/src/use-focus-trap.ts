import type { RefObject } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab/Shift+Tab focus within `containerRef` while `active`, and restores focus to whatever
 * element had it beforehand once `active` goes false (or the component unmounts) - so a modal
 * drawer can't leak keyboard focus into obscured background content, and closing it doesn't strand
 * focus on `document.body`.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? container)?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab" || !container) return;
      const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [active, containerRef]);
}
