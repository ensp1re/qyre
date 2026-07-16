import type { ReactNode } from "react";

/** A single toggle button in a view-switcher group (Schema tab's Graph/Grid, F074; Tables tab's
 * Rows/Structure, F114) - shared once a second real usage needed the identical look/behavior. */
export function ViewButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "relative flex items-center gap-1.5 px-2 text-[11px] font-medium outline-none transition-colors focus-visible:bg-accent " +
        (active
          ? "bg-background text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
