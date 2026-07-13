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
        "flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[11px] transition-colors " +
        (active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
