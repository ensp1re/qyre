import type { ConnectionStatus, DatabaseEngine } from "@humb/core";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface StatusBarProps {
  status: ConnectionStatus;
  engine?: DatabaseEngine;
  schema?: string;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  unconfigured: "No database"
};

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "bg-[var(--c-green)]",
  disconnected: "bg-[var(--c-red)]",
  unconfigured: "bg-muted-foreground"
};

/**
 * Bottom chrome bar: connection status, engine, current schema, encoding. Engine version is
 * deferred to DF-08 (needs a new HealthResponse field) - engine name alone is already available
 * from DatabaseOverview.
 */
export function StatusBar({ status, engine, schema }: StatusBarProps): ReactNode {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_COLOR[status])} />
        {STATUS_LABEL[status]}
      </span>
      {engine && <span>{engine}</span>}
      {schema && <span>{schema}</span>}
      <span className="ml-auto">UTF-8</span>
    </footer>
  );
}
