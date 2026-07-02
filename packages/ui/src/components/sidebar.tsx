import type { SchemaMetadata } from "@humb/core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { SchemaTree, type SelectedTable } from "./schema-tree.js";

export interface SidebarProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/** The app shell's left rail: a collapsible panel hosting the searchable schema tree. */
export function Sidebar({
  schemas,
  selected,
  onSelect,
  isLoading,
  isError,
  onRetry
}: SidebarProps): ReactNode {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2">
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={() => setCollapsed(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex shrink-0 items-center justify-between px-2 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Explorer
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={() => setCollapsed(true)}
          className="rounded-md p-1 hover:bg-sidebar-accent hover:text-foreground"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">Loading schemas...</p>
        ) : isError ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            Failed to load schemas.{" "}
            <button type="button" onClick={onRetry} className="text-primary underline">
              Retry
            </button>
          </div>
        ) : schemas.length > 0 ? (
          <SchemaTree schemas={schemas} selected={selected} onSelect={onSelect} />
        ) : (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">No tables found.</p>
        )}
      </div>
    </aside>
  );
}
