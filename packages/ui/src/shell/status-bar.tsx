import type { ConnectionStatus, DatabaseEngine } from "@qyre/core";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";

export interface StatusBarProps {
  status: ConnectionStatus;
  engine?: DatabaseEngine;
  engineVersion?: string | null;
  schema?: string;
  /** The current connection target (e.g. `postgres://user:***@host:5432/qyre_test`) - its final
   * path segment is shown after `schema` as the database name. */
  target?: string | null;
  lastQueryMs?: number;
  /** Round-trip time of the health check this status is based on, in ms (F042). */
  pingLatencyMs?: number | null;
  /** The most recent ping failure's error message, shown as a tooltip while disconnected (F042). */
  lastError?: string | null;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "connected",
  disconnected: "disconnected",
  unconfigured: "no database"
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--c-green)",
  disconnected: "var(--c-red)",
  unconfigured: "rgb(var(--muted-foreground))"
};

function Separator(): ReactNode {
  return <span className="text-border">·</span>;
}

/** The final path segment of a connection target - the database name for a network connection
 * string, or the filename for a SQLite file path. */
function databaseNameFromTarget(target: string): string | undefined {
  const trimmed = target.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? undefined : trimmed.slice(lastSlash + 1) || undefined;
}

/** Bottom chrome bar: connection status, engine + version, current schema, and database name. */
export function StatusBar({
  status,
  engine,
  engineVersion,
  schema,
  target,
  lastQueryMs,
  pingLatencyMs,
  lastError
}: StatusBarProps): ReactNode {
  const engineLabel = engineVersion ?? engine;
  const databaseName = target ? databaseNameFromTarget(target) : undefined;
  const statusTitle =
    status === "disconnected" && lastError
      ? lastError
      : pingLatencyMs != null
        ? `ping ${pingLatencyMs}ms`
        : undefined;

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-border bg-sidebar px-3 sm:px-4 font-mono text-[10px]">
      <div className="flex min-w-0 items-center gap-3 text-muted-foreground/60">
        <span style={{ color: STATUS_COLOR[status] }} title={statusTitle}>
          {STATUS_LABEL[status]}
        </span>
        {engineLabel && (
          <>
            <Separator />
            <span className="hidden sm:inline">{engineLabel}</span>
          </>
        )}
        {schema && (
          <>
            <Separator />
            <span className="hidden truncate sm:inline">{schema}</span>
          </>
        )}
        {databaseName && (
          <>
            <Separator />
            <span className="hidden truncate text-foreground/70 sm:inline">{databaseName}</span>
          </>
        )}
      </div>
      {lastQueryMs !== undefined && (
        <div className="hidden shrink-0 items-center gap-1 text-muted-foreground/40 sm:flex">
          <Clock className="h-2.5 w-2.5" />
          {lastQueryMs}ms
        </div>
      )}
    </footer>
  );
}
