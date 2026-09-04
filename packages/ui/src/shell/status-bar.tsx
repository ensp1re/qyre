import type { ConnectionCapabilities, ConnectionStatus, DatabaseEngine } from "@qyre/core";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { READ_ONLY_REASON_LABEL } from "./read-only-reason.js";

export interface StatusBarProps {
  status: ConnectionStatus;
  engine?: DatabaseEngine;
  engineVersion?: string | null;
  schema?: string;
  target?: string | null;
  lastQueryMs?: number;
  pingLatencyMs?: number | null;
  lastError?: string | null;
  capabilities?: ConnectionCapabilities;
}

function isWritable(capabilities: ConnectionCapabilities): boolean {
  return (
    capabilities.supportsRowMutations ||
    capabilities.supportsDdl ||
    capabilities.supportsIndexManagement ||
    capabilities.supportsDatabaseManagement
  );
}

export function AccessBadge({
  capabilities
}: {
  capabilities?: ConnectionCapabilities;
}): ReactNode {
  if (!capabilities || isWritable(capabilities)) return null;
  const title =
    (capabilities.readOnlyReason && READ_ONLY_REASON_LABEL[capabilities.readOnlyReason]) ??
    "Read-only";
  return (
    <span
      data-testid="access-badge"
      data-access="read-only"
      title={title}
      style={{ color: "var(--c-red)" }}
    >
      read-only
    </span>
  );
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

function databaseNameFromTarget(target: string): string | undefined {
  const trimmed = target.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? undefined : trimmed.slice(lastSlash + 1) || undefined;
}

export function StatusBar({
  status,
  engine,
  engineVersion,
  schema,
  target,
  lastQueryMs,
  pingLatencyMs,
  lastError,
  capabilities
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
      <div className="flex min-w-0 items-center gap-3 text-quiet-foreground">
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
        {capabilities && (
          <>
            <Separator />
            <AccessBadge capabilities={capabilities} />
          </>
        )}
      </div>
      {lastQueryMs !== undefined && (
        <div className="hidden shrink-0 items-center gap-1 text-quiet-foreground sm:flex">
          <Clock className="h-2.5 w-2.5" />
          {lastQueryMs}ms
        </div>
      )}
    </footer>
  );
}
