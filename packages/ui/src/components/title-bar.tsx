import type { ConnectionStatus } from "@humb/core";
import { Moon, RefreshCw, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface TitleBarProps {
  status: ConnectionStatus;
  target: string | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "bg-[var(--c-green)]",
  disconnected: "bg-[var(--c-red)]",
  unconfigured: "bg-muted-foreground"
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  unconfigured: "No database"
};

/**
 * Top chrome bar: wordmark, connection breadcrumb, status dot, and window-level actions.
 * Dark/light toggle and settings are chrome-only placeholders here - DF-09 wires the theme toggle,
 * settings stays inert until there's something real to configure (docs/product-specs/dashboard-ui.md).
 */
export function TitleBar({ status, target, onRefresh, isRefreshing }: TitleBarProps): ReactNode {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="m-0 shrink-0 text-[13px] font-semibold tracking-tight">Humb</h1>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {target ?? "not connected"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          data-testid="status-badge"
          data-status={status}
          title={STATUS_LABEL[status]}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_COLOR[status])} />
          {STATUS_LABEL[status]}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          aria-label="Toggle theme"
          disabled
          className="cursor-not-allowed rounded-md p-1 text-muted-foreground opacity-50"
        >
          <Moon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Settings"
          disabled
          className="cursor-not-allowed rounded-md p-1 text-muted-foreground opacity-50"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
