import type {
  ConnectionCapabilities,
  ConnectionStatus,
  DatabaseEngine,
  SchemaMetadata
} from "@qyre/core";
import { CircleAlert, Database, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../cn.js";
import { Spinner } from "../../feedback/spinner.js";
import { ConfirmTypedNameDialog } from "../../primitives/confirm-typed-name-dialog.js";
import { Button } from "../../primitives/controls/button.js";
import { CreateNamedDialog } from "../../primitives/create-named-dialog.js";
import { ResizeHandle } from "../../primitives/resize-handle.js";
import { AccessBadge } from "../../shell/status-bar.js";
import { SchemaTree, type SelectedTable } from "./schema-tree.js";

type SchemaDialogState = { kind: "create" } | { kind: "drop"; schema: string } | undefined;

export const SIDEBAR_DEFAULT_WIDTH = 256;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export interface SidebarProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void | Promise<unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  canManageSchemas?: boolean;
  onCreateSchema?: (name: string) => Promise<void>;
  onDropSchema?: (name: string) => Promise<void>;
  status: ConnectionStatus;
  target?: string | null;
  engine?: DatabaseEngine;
  engineVersion?: string | null;
  capabilities?: ConnectionCapabilities;
  onOpenConnection: () => void;
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--c-green)",
  disconnected: "var(--c-red)",
  unconfigured: "rgb(var(--muted-foreground))"
};

function databaseNameFromTarget(target?: string | null): string {
  if (!target) return "No database";
  const trimmed = target.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "Database";
}

export function Sidebar({
  schemas,
  selected,
  onSelect,
  isLoading,
  isError,
  onRetry,
  open,
  onOpenChange,
  width,
  onWidthChange,
  canManageSchemas,
  onCreateSchema,
  onDropSchema,
  status,
  target,
  engine,
  engineVersion,
  capabilities,
  onOpenConnection
}: SidebarProps): ReactNode {
  const resizable = open && width !== undefined && onWidthChange !== undefined;
  const [dialog, setDialog] = useState<SchemaDialogState>(undefined);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleCreateSchema(name: string): Promise<void> {
    if (!onCreateSchema) return;
    setBusy(true);
    setError(undefined);
    try {
      await onCreateSchema(name);
      setDialog(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create schema.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDropSchema(): Promise<void> {
    if (!onDropSchema || dialog?.kind !== "drop") return;
    setBusy(true);
    setError(undefined);
    try {
      await onDropSchema(dialog.schema);
      setDialog(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to drop schema.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry(): Promise<void> {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

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
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2.5">
              <h1 className="font-mono text-[13px] font-semibold tracking-tight text-foreground">
                Qyre
              </h1>
              <span className="text-[10px] uppercase tracking-[0.12em] text-quiet-foreground">
                Database
              </span>
              <button
                type="button"
                aria-label="Collapse sidebar"
                onClick={() => onOpenChange(false)}
                className="ml-auto rounded-[3px] p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {isLoading ? (
                <p className="flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <Spinner /> Loading schemas...
                </p>
              ) : isError ? (
                <div
                  role="alert"
                  className="flex h-full items-center justify-center px-5 py-6 text-center"
                >
                  <div className="flex max-w-48 flex-col items-center">
                    <CircleAlert
                      className="mb-2 h-4 w-4 text-destructive"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <p className="text-[11px] font-medium text-foreground">Schemas unavailable</p>
                    <p className="mt-1 text-[10px] leading-4 text-quiet-foreground">
                      Check the connection, then try loading the explorer again.
                    </p>
                    {onRetry && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={retrying}
                        onClick={() => void handleRetry()}
                        className="mt-3"
                      >
                        {!retrying && <RefreshCw className="h-3 w-3" strokeWidth={1.8} />}
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ) : status === "connected" && schemas.length === 0 ? (
                <div
                  data-testid="empty-database-state"
                  className="flex h-full items-center justify-center px-5 py-6 text-center"
                >
                  <div className="flex max-w-48 flex-col items-center">
                    <Database
                      className="mb-2 h-4 w-4 text-muted-foreground"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <p className="text-[11px] font-medium text-foreground">
                      No tables in this database
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-quiet-foreground">
                      This database is empty. Create tables, or switch to another database on this
                      server.
                    </p>
                    <Button variant="outline" size="sm" onClick={onOpenConnection} className="mt-3">
                      <Database className="h-3 w-3" strokeWidth={1.8} />
                      Switch database
                    </Button>
                  </div>
                </div>
              ) : (
                <SchemaTree
                  schemas={schemas}
                  selected={selected}
                  onSelect={(schema, table) => {
                    onSelect(schema, table);
                    if (window.innerWidth < 768) onOpenChange(false);
                  }}
                  canManageSchemas={canManageSchemas}
                  onRequestCreateSchema={
                    onCreateSchema
                      ? () => {
                          setDialog({ kind: "create" });
                          setError(undefined);
                        }
                      : undefined
                  }
                  onRequestDropSchema={
                    onDropSchema
                      ? (schema) => {
                          setDialog({ kind: "drop", schema });
                          setError(undefined);
                        }
                      : undefined
                  }
                />
              )}
            </div>
            <button
              type="button"
              onClick={onOpenConnection}
              data-testid="status-badge"
              data-status={status}
              aria-label={`Change connection, current database ${databaseNameFromTarget(target)}, ${status}`}
              className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-2.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="relative shrink-0">
                <Database className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-sidebar"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[10px] text-foreground/80">
                  {databaseNameFromTarget(target)}
                </span>
                <span className="flex items-center gap-1 text-[9px] text-quiet-foreground">
                  <span className="truncate">
                    {engineVersion ?? engine ?? (status === "connected" ? "Connected" : status)}
                  </span>
                  <AccessBadge capabilities={capabilities} />
                </span>
                <span data-testid="connection-summary" className="sr-only">
                  {status === "connected"
                    ? "Connected"
                    : status === "disconnected"
                      ? "Disconnected"
                      : "No database"}
                </span>
              </span>
            </button>
          </>
        ) : (
          <div className="hidden h-full flex-col items-center gap-2 px-0.5 py-1 md:flex">
            <button
              type="button"
              aria-label="Expand sidebar"
              onClick={() => onOpenChange(true)}
              className="rounded-[3px] p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenConnection}
              data-testid="status-badge"
              data-status={status}
              aria-label={`Change connection, current database ${databaseNameFromTarget(target)}, ${status}`}
              className="relative mt-auto rounded-[3px] p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Database className="h-3.5 w-3.5" />
              <span data-testid="connection-summary" className="sr-only">
                {status === "connected"
                  ? "Connected"
                  : status === "disconnected"
                    ? "Disconnected"
                    : "No database"}
              </span>
              <span
                className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ring-1 ring-sidebar"
                style={{ backgroundColor: STATUS_COLOR[status] }}
              />
            </button>
          </div>
        )}
      </aside>

      {resizable && (
        <div className="hidden md:block">
          <ResizeHandle
            orientation="vertical"
            value={width}
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            onChange={onWidthChange}
            aria-label="Resize sidebar"
          />
        </div>
      )}

      {dialog?.kind === "create" && (
        <CreateNamedDialog
          title="New schema"
          label="Schema name"
          creating={busy}
          error={error}
          onCreate={(name) => void handleCreateSchema(name)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === "drop" && (
        <ConfirmTypedNameDialog
          title={`Drop schema ${dialog.schema}`}
          description={`Type the schema's name to confirm dropping "${dialog.schema}". This can't be undone.`}
          targetName={dialog.schema}
          confirmLabel="Drop schema"
          busy={busy}
          error={error}
          onConfirm={() => void handleDropSchema()}
          onClose={() => setDialog(undefined)}
        />
      )}
    </>
  );
}
