import { FileCode2, FolderOpen, Network, Table2, Terminal, type LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../cn.js";

export type ShellTab = "sql-editor" | "tables" | "schema" | "files" | "console";

const TABS: { id: ShellTab; label: string; icon: LucideIcon }[] = [
  { id: "sql-editor", label: "SQL Editor", icon: FileCode2 },
  { id: "tables", label: "Tables", icon: Table2 },
  { id: "schema", label: "Schema", icon: Network },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "console", label: "Console", icon: Terminal }
];

export interface TabBarProps {
  active: ShellTab;
  onChange: (tab: ShellTab) => void;
  hiddenTabs?: ShellTab[];
  disabledTabs?: Partial<Record<ShellTab, string>>;
  actions?: ReactNode;
}

export function TabBar({
  active,
  onChange,
  hiddenTabs = [],
  disabledTabs = {},
  actions
}: TabBarProps): ReactNode {
  const hidden = new Set(hiddenTabs);
  function moveTabFocus(event: KeyboardEvent<HTMLDivElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
    );
    if (tabs.length === 0) return;
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, -1) + 1) % tabs.length;
    else next = (current <= 0 ? tabs.length : current) - 1;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  return (
    <div className="flex h-9 shrink-0 border-b border-border bg-card">
      <div
        role="tablist"
        aria-label="Workspace"
        onKeyDown={moveTabFocus}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
      >
        {TABS.filter(({ id }) => !hidden.has(id)).map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          const disabledReason = disabledTabs[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-label={label}
              aria-selected={isActive}
              aria-disabled={Boolean(disabledReason)}
              disabled={Boolean(disabledReason)}
              title={disabledReason ?? label}
              onClick={() => onChange(id)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap border-r border-border px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:bg-accent sm:px-3",
                disabledReason
                  ? "cursor-not-allowed text-quiet-foreground"
                  : isActive
                    ? "bg-background text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" strokeWidth={1.8} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
      {actions}
    </div>
  );
}
