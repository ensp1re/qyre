import { AlertTriangle, ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Spinner } from "../feedback/spinner.js";
import { ConfirmTypedNameDialog } from "../primitives/confirm-typed-name-dialog.js";
import { CreateNamedDialog } from "../primitives/create-named-dialog.js";

export interface DatabasePanelProps {
  databases: string[] | undefined;
  loading: boolean;
  loadError?: string;
  currentDatabase: string | undefined;
  canManage: boolean;
  hiddenReason?: string;
  onSwitch: (database: string) => Promise<void>;
  onCreate: (database: string) => Promise<void>;
  onDrop: (database: string) => Promise<void>;
}

export function DatabasePanel({
  databases,
  loading,
  loadError,
  currentDatabase,
  canManage,
  hiddenReason,
  onSwitch,
  onCreate,
  onDrop
}: DatabasePanelProps): ReactNode {
  const [switchingTo, setSwitchingTo] = useState<string | undefined>(undefined);
  const [switchError, setSwitchError] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string | undefined>(undefined);
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | undefined>(undefined);

  async function handleSwitch(database: string): Promise<void> {
    setSwitchingTo(database);
    setSwitchError(undefined);
    try {
      await onSwitch(database);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Failed to switch database.");
    } finally {
      setSwitchingTo(undefined);
    }
  }

  async function handleCreate(database: string): Promise<void> {
    setCreating(true);
    setCreateError(undefined);
    try {
      await onCreate(database);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create database.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDrop(): Promise<void> {
    if (!dropTarget) return;
    setDropping(true);
    setDropError(undefined);
    try {
      await onDrop(dropTarget);
      setDropTarget(undefined);
    } catch (err) {
      setDropError(err instanceof Error ? err.message : "Failed to drop database.");
    } finally {
      setDropping(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 font-mono text-[9px] uppercase tracking-widest text-quiet-foreground">
          Databases on this server
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setCreateError(undefined);
            }}
            className="flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> New database
          </button>
        )}
      </div>
      {!canManage && hiddenReason && (
        <p className="mt-1 font-mono text-[10px] text-quiet-foreground" title={hiddenReason}>
          Create/drop hidden: {hiddenReason}
        </p>
      )}

      {loading ? (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Spinner /> Loading databases...
        </p>
      ) : loadError ? (
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{loadError}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {(databases ?? []).map((database) => {
            const isCurrent = database === currentDatabase;
            return (
              <li
                key={database}
                className="flex items-center gap-1.5 rounded-[3px] border border-border bg-background px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
                  {database}
                </span>
                {isCurrent ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-quiet-foreground">
                    current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSwitch(database)}
                    disabled={switchingTo !== undefined}
                    aria-label={`Switch to ${database}`}
                    className="flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {switchingTo === database ? (
                      <Spinner className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowRightLeft className="h-2.5 w-2.5" />
                    )}
                    Switch
                  </button>
                )}
                {canManage && !isCurrent && (
                  <button
                    type="button"
                    onClick={() => {
                      setDropTarget(database);
                      setDropError(undefined);
                    }}
                    aria-label={`Drop database ${database}`}
                    className="shrink-0 rounded-[2px] p-1 text-muted-foreground hover:bg-accent"
                    style={{ color: "var(--c-red)" }}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {switchError && (
        <p
          className="mt-1.5 flex items-start gap-1.5 font-mono text-[10px]"
          style={{ color: "var(--c-red)" }}
        >
          <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          {switchError}
        </p>
      )}

      {createOpen && (
        <CreateNamedDialog
          title="New database"
          label="Database name"
          creating={creating}
          error={createError}
          onCreate={(name) => void handleCreate(name)}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {dropTarget && (
        <ConfirmTypedNameDialog
          title={`Drop ${dropTarget}`}
          description={`Type the database's name to confirm dropping "${dropTarget}". This can't be undone.`}
          targetName={dropTarget}
          confirmLabel="Drop database"
          busy={dropping}
          error={dropError}
          onConfirm={() => void handleDrop()}
          onClose={() => setDropTarget(undefined)}
        />
      )}
    </div>
  );
}
