import { Database, Menu, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { IconButton } from "../primitives/controls/icon-button.js";

export interface WorkspaceActionsProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onToggleSidebar: () => void;
  onOpenConnection: () => void;
  onOpenSettings: () => void;
  lastQueryMs?: number;
}

export function WorkspaceActions({
  theme,
  onToggleTheme,
  onRefresh,
  isRefreshing,
  onToggleSidebar,
  onOpenConnection,
  onOpenSettings,
  lastQueryMs
}: WorkspaceActionsProps): ReactNode {
  const iconClass = "h-3.5 w-3.5";
  return (
    <div
      role="toolbar"
      aria-label="Workspace actions"
      className="ml-auto flex h-full shrink-0 items-center gap-0.5 px-1.5"
    >
      <IconButton
        data-command-item
        variant="ghost"
        label="Toggle sidebar"
        onClick={onToggleSidebar}
        icon={<Menu className={iconClass} />}
        className="h-7 w-7 md:hidden"
      />
      {lastQueryMs !== undefined && (
        <span className="hidden px-1 font-mono text-[10px] text-quiet-foreground sm:inline">
          {lastQueryMs}ms
        </span>
      )}
      <IconButton
        data-command-item
        variant="ghost"
        label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={onToggleTheme}
        icon={theme === "dark" ? <Sun className={iconClass} /> : <Moon className={iconClass} />}
        className="h-7 w-7"
      />
      <IconButton
        data-command-item
        variant="ghost"
        label="Refresh workspace"
        onClick={onRefresh}
        disabled={isRefreshing}
        icon={<RefreshCw className={cn(iconClass, isRefreshing && "animate-spin")} />}
        className="h-7 w-7"
      />
      <IconButton
        data-command-item
        variant="ghost"
        label="Switch database connection"
        onClick={onOpenConnection}
        icon={<Database className={iconClass} />}
        className="h-7 w-7"
      />
      <IconButton
        data-command-item
        variant="ghost"
        label="Settings"
        onClick={onOpenSettings}
        icon={<Settings className={iconClass} />}
        className="h-7 w-7"
      />
    </div>
  );
}
