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
    <div role="tablist" className="flex shrink-0 border-b border-border bg-card">
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
              "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-1.5 text-[12px]",
              isActive
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
