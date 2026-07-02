import { FileCode2, FolderOpen, Network, Table2, Terminal, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
}

/** The IDE-style tab strip switching between the shell's five content panes. */
export function TabBar({ active, onChange }: TabBarProps): ReactNode {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-card px-2 pt-1"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[3px] px-3 py-1.5 text-[11px] font-medium transition-colors",
              isActive
                ? "-mb-px border border-border border-b-background bg-background text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
