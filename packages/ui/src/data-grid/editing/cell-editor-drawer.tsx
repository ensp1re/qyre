import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";
import { IconButton } from "../../primitives/controls/icon-button.js";

export interface CellEditorDrawerProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function CellEditorDrawer({ title, children, onClose }: CellEditorDrawerProps): ReactNode {
  const asideRef = useRef<HTMLElement>(null);
  useFocusTrap(asideRef, true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="cell-editor-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l border-border bg-card outline-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-quiet-foreground">
            Edit cell
          </span>
          <span className="truncate font-mono text-[10px] text-foreground/70">{title}</span>
          <IconButton
            onClick={onClose}
            label="Close"
            icon={<X className="h-3.5 w-3.5" />}
            variant="ghost"
            className="ml-auto"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-1">{children}</div>
      </aside>
    </>
  );
}
