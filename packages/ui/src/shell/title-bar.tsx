import type { ConnectionStatus } from "@qyre/core";
import { Database, Menu, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface TitleBarProps {
  status: ConnectionStatus;
  target: string | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onToggleSidebar: () => void;
  /** Opens the connection-switch drawer (F064). */
  onOpenConnection: () => void;
  /** Opens the full-screen Settings view (F087). */
  onOpenSettings: () => void;
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

function splitTarget(target: string): { prefix?: string; name: string } {
  const lastSlash = target.lastIndexOf("/");
  if (lastSlash === -1) return { name: target };
  return { prefix: target.slice(0, lastSlash), name: target.slice(lastSlash + 1) };
}

/** Top chrome bar: wordmark, connection breadcrumb, status dot, and window-level actions. */
export function TitleBar({
  status,
  target,
  theme,
  onToggleTheme,
  onRefresh,
  isRefreshing,
  onToggleSidebar,
  onOpenConnection,
  onOpenSettings
}: TitleBarProps): ReactNode {
  const breadcrumb = target ? splitTarget(target) : null;

  return (
    <header className="flex h-9 shrink-0 items-center border-b border-border bg-card px-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="mr-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <h1 className="m-0 mr-4 shrink-0 font-mono text-[13px] font-semibold tracking-tight text-foreground">
        Qyre
      </h1>

      <div className="mr-4 hidden h-3.5 w-px shrink-0 bg-border sm:block" />

      <div className="flex min-w-0 items-center gap-0 truncate font-mono text-[11px]">
        {breadcrumb ? (
          <span className="truncate text-muted-foreground/60">
            {breadcrumb.prefix ?? breadcrumb.name}
          </span>
        ) : (
          <span className="text-muted-foreground/60">not connected</span>
        )}
      </div>

      <span
        data-testid="status-badge"
        data-status={status}
        title={STATUS_LABEL[status]}
        className="ml-3 flex shrink-0 items-center gap-1.5"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_COLOR[status])} />
        {/* Visually redundant with the dot's color + the span's own title tooltip - kept in the
         * accessibility tree (not display:none) rather than shown inline, since color alone
         * shouldn't be the only signal for color-blind users. */}
        <span data-testid="connection-summary" className="sr-only">
          {STATUS_LABEL[status]}
        </span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={onOpenConnection}
          title="Switch database connection"
          aria-label="Switch database connection"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Database className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
