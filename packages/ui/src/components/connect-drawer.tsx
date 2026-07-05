import { Settings, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../cn.js";
import { useFocusTrap } from "../use-focus-trap.js";
import { Spinner } from "./spinner.js";

/** One previously-connected target (F064), most recent first. Persisted by the caller (apps/web),
 * not this package - packages/ui stays presentation-only per FRONTEND.md. */
export interface RecentTarget {
  /** The raw connection string/file path, so reconnecting doesn't require retyping credentials. */
  readonly raw: string;
  /** Redacted, safe-to-render form of `raw`. */
  readonly display: string;
}

export interface ConnectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current connection's redacted display string, or null when nothing is connected. */
  currentTarget: string | null;
  recentTargets: RecentTarget[];
  /** Attempts to connect to `raw`. Resolves/rejects; a rejection's message is shown inline. */
  onConnect: (raw: string) => Promise<void>;
  isConnecting: boolean;
}

/**
 * A right-anchored slide-in drawer (same pattern as `QueryHistoryDrawer`/`CellValueDrawer`) for
 * switching the running Qyre instance to a different database connection without restarting the
 * CLI (F064). See docs/product-specs/database-switching.md.
 */
export function ConnectDrawer({
  open,
  onOpenChange,
  currentTarget,
  recentTargets,
  onConnect,
  isConnecting
}: ConnectDrawerProps): ReactNode {
  const asideRef = useRef<HTMLElement | null>(null);
  useFocusTrap(asideRef, open);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function attemptConnect(raw: string): Promise<void> {
    const trimmed = raw.trim();
    if (!trimmed || isConnecting) return;
    setError(undefined);
    try {
      await onConnect(trimmed);
      setValue("");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : String(connectError));
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void attemptConnect(value);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="connect-drawer"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-card outline-none transition-transform duration-150",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Settings className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Connection
          </span>
          <button
            type="button"
            aria-label="Close connection settings"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Current
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-foreground/80">
            {currentTarget ?? "Not connected"}
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
            <label
              htmlFor="connect-target-input"
              className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60"
            >
              Connect to a different database
            </label>
            <input
              id="connect-target-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={isConnecting}
              placeholder="postgres://user:pass@host:5432/db"
              className="rounded-[3px] border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isConnecting || !value.trim()}
              className="flex items-center justify-center gap-1.5 rounded-[3px] bg-primary px-2 py-1.5 font-mono text-[11px] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConnecting && <Spinner className="text-primary-foreground" />}
              Connect
            </button>
            {error && (
              <p role="alert" className="font-mono text-[11px]" style={{ color: "var(--c-red)" }}>
                {error}
              </p>
            )}
          </form>

          {recentTargets.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                Recent
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {recentTargets.map((recent) => (
                  <li key={recent.raw}>
                    <button
                      type="button"
                      data-testid="recent-target-card"
                      disabled={isConnecting}
                      onClick={() => void attemptConnect(recent.raw)}
                      className="w-full rounded-[3px] border border-border bg-background p-2 text-left font-mono text-[11px] text-foreground/80 transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {recent.display}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
