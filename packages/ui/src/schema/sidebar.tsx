import type { ConnectionStatus, SchemaMetadata } from "@qyre/core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { Spinner } from "../feedback/spinner.js";
import { ResizeHandle } from "../primitives/resize-handle.js";
import { SchemaTree, type SelectedTable } from "./schema-tree.js";

/** The default/min/max are exported so the caller owning persistence (F071's `usePanelSize`) can
 * seed and clamp against the same numbers this component uses, instead of duplicating them. */
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;

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
  /** Width in px while open (F071). Omitted keeps the previous fixed 256px (`w-64`) - both this
   * and `onWidthChange` must be supplied together for the resize handle to appear. */
  width?: number;
  onWidthChange?: (width: number) => void;
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
  onOpenChange,
  width,
  onWidthChange
}: SidebarProps): ReactNode {
  const resizable = open && width !== undefined && onWidthChange !== undefined;
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
        style={resizable ? { width } : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-150",
          !resizable && "w-64",
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
                <p className="flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <Spinner /> Loading schemas...
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
                    // Only the mobile off-canvas drawer should auto-close on selection - the
                    // desktop rail should stay open, since collapsing it every click is the
                    // opposite of useful there.
                    if (window.innerWidth < 768) onOpenChange(false);
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

      {resizable && (
        <div className="hidden md:block">
          <ResizeHandle
            orientation="vertical"
            value={width}
            min={SIDEBAR_MIN_WIDTH}
            max={SIDEBAR_MAX_WIDTH}
            onChange={onWidthChange}
            aria-label="Resize sidebar"
          />
        </div>
      )}
    </>
  );
}
