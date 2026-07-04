import type { ConnectionStatus, DatabaseEngine } from "@humbdb/core";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";

export interface StatusBarProps {
  status: ConnectionStatus;
  engine?: DatabaseEngine;
  engineVersion?: string | null;
  schema?: string;
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

/** Bottom chrome bar: connection status, engine + version, current schema, encoding. */
export function StatusBar({
  status,
  engine,
  engineVersion,
  schema,
  lastQueryMs,
  pingLatencyMs,
  lastError
}: StatusBarProps): ReactNode {
  const engineLabel = engineVersion ?? engine;
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
      </div>
      <div className="hidden shrink-0 items-center gap-3 text-muted-foreground/40 sm:flex">
        <span>UTF-8</span>
        {lastQueryMs !== undefined && (
          <>
            <Separator />
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {lastQueryMs}ms
            </span>
          </>
        )}
      </div>
    </footer>
  );
}
