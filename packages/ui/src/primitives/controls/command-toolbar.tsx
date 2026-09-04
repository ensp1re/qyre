import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../cn.js";

export interface CommandToolbarProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function CommandToolbar({ label, children, className }: CommandToolbarProps): ReactNode {
  function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-command-item]:not(:disabled)")
    ).filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, -1) + 1) % items.length;
    else next = (current <= 0 ? items.length : current) - 1;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div
      role="toolbar"
      aria-label={label}
      onKeyDown={moveFocus}
      className={cn(
        "flex h-8 min-w-0 shrink-0 items-center gap-1 overflow-visible border-b border-border bg-card px-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CommandGroup({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex shrink-0 items-center gap-1", className)}
    >
      {children}
    </div>
  );
}

export function CommandSeparator(): ReactNode {
  return <span role="separator" aria-orientation="vertical" className="mx-1 h-4 w-px bg-border" />;
}
