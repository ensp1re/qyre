import type { ConnectionStatus, SchemaMetadata } from "@humb/core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { SchemaTree, type SelectedTable } from "./schema-tree.js";

export interface SidebarProps {
  target: string | null;
  status: ConnectionStatus;
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The app shell's left rail: a searchable schema tree. Desktop collapses to an icon rail; below
 * the `md` breakpoint it becomes an off-canvas overlay drawer (opened via TitleBar's hamburger),
 * both driven by the same `open` state so there is one source of truth for visibility.
 */
export function Sidebar({
  target,
  status,
  schemas,
  selected,
  onSelect,
  isLoading,
  isError,
  onRetry,
  open,
  onOpenChange
}: SidebarProps): ReactNode {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-150",
          "md:static md:z-auto md:translate-x-0 md:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
          !open && "md:w-8"
        )}
      >
        {open ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                Explorer
              </span>
              <button
                type="button"
                aria-label="Collapse sidebar"
                onClick={() => onOpenChange(false)}
                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-3 w-3" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {isLoading ? (
                <p className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  Loading schemas...
                </p>
              ) : isError ? (
                <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  Failed to load schemas.{" "}
                  <button type="button" onClick={onRetry} className="text-primary underline">
                    Retry
                  </button>
                </div>
              ) : (
                <SchemaTree
                  target={target}
                  status={status}
                  schemas={schemas}
                  selected={selected}
                  onSelect={(schema, table) => {
                    onSelect(schema, table);
                    onOpenChange(false);
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="hidden flex-col items-center gap-2 px-1.5 py-2 md:flex">
            <button
              type="button"
              aria-label="Expand sidebar"
              onClick={() => onOpenChange(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
