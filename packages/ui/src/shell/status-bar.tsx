import type { ConnectionCapabilities, ConnectionStatus, DatabaseEngine } from "@qyre/core";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { READ_ONLY_REASON_LABEL } from "./read-only-reason.js";

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
  /** Session-level write capabilities (F091) - renders the read-only/read-write access badge
   * (F097). Omitted while disconnected/loading, same as every other connection-dependent field. */
  capabilities?: ConnectionCapabilities;
}

/** True once the session can perform at least one kind of write - the same "any supports* flag
 * true" test the product spec uses to decide whether any write affordance may render at all. */
function isWritable(capabilities: ConnectionCapabilities): boolean {
  return (
    capabilities.supportsRowMutations ||
    capabilities.supportsDdl ||
    capabilities.supportsIndexManagement ||
    capabilities.supportsDatabaseManagement
  );
}

/** Read-only/read-write access badge (F097) - a visible, always-explained indicator of the
 * session's write capability, independent of the underlying connection status dot. */
function AccessBadge({ capabilities }: { capabilities?: ConnectionCapabilities }): ReactNode {
  if (!capabilities) return null;
  const writable = isWritable(capabilities);
  const title = writable
    ? "This session can modify data"
    : ((capabilities.readOnlyReason && READ_ONLY_REASON_LABEL[capabilities.readOnlyReason]) ??
      "Read-only");
  return (
    <span
      data-testid="access-badge"
      data-access={writable ? "read-write" : "read-only"}
      title={title}
      style={{ color: writable ? "var(--c-green)" : "var(--c-red)" }}
    >
      {writable ? "read-write" : "read-only"}
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
        {capabilities && (
          <>
            <Separator />
            <AccessBadge capabilities={capabilities} />
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
