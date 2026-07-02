import type { ConnectionStatus, DatabaseEngine } from "@humb/core";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";

export interface StatusBarProps {
  status: ConnectionStatus;
  engine?: DatabaseEngine;
  schema?: string;
  lastQueryMs?: number;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "connected",
  disconnected: "disconnected",
  unconfigured: "no database"
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--c-green)",
  disconnected: "var(--c-red)",
  unconfigured: "var(--muted-foreground)"
};

function Separator(): ReactNode {
  return <span className="text-border">·</span>;
}

/**
 * Bottom chrome bar: connection status, engine, current schema, encoding. Engine version is
 * deferred to DF-08 (needs a new HealthResponse field) - engine name alone is already available
 * from DatabaseOverview.
 */
export function StatusBar({ status, engine, schema, lastQueryMs }: StatusBarProps): ReactNode {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-border bg-sidebar px-3 sm:px-4 font-mono text-[10px]">
      <div className="flex min-w-0 items-center gap-3 text-muted-foreground/60">
        <span style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
        {engine && (
          <>
            <Separator />
            <span className="hidden sm:inline">{engine}</span>
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
