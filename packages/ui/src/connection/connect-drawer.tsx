import { Database, X } from "lucide-react";
import type { ClipboardEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn.js";
import { Spinner } from "../feedback/spinner.js";
import { Segmented } from "../primitives/segmented.js";
import { useFocusTrap } from "../primitives/use-focus-trap.js";
import { DatabasePanel } from "./database-panel.js";

/** One previously-connected target (F064), most recent first. Persisted by the caller (apps/web),
 * not this package - packages/ui stays presentation-only per FRONTEND.md. */
export interface RecentTarget {
  /** The raw connection string/file path, so reconnecting doesn't require retyping credentials. */
  readonly raw: string;
  /** Redacted, safe-to-render form of `raw`. */
  readonly display: string;
}

/** Engines the field-entry form supports (F073) - SQLite is a file path, not a
 * host/port/user/password shape, so it stays URL/path-only via the existing text input. */
export type FieldEngine = "postgres" | "mysql" | "mongodb";

export interface ConnectionFields {
  engine: FieldEngine;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export const FIELD_ENGINE_DEFAULT_PORT: Record<FieldEngine, string> = {
  postgres: "5432",
  mysql: "3306",
  mongodb: "27017"
};

const FIELD_ENGINE_LABEL: Record<FieldEngine, string> = {
  postgres: "Postgres",
  mysql: "MySQL",
  mongodb: "MongoDB"
};

/**
 * Composes a connection string from discrete fields (F073) - an alternative to pasting one for
 * developers who think in host/port/user/password rather than URL syntax. `host`/`port` fall back
 * to `localhost`/each engine's default port when left blank, matching how a developer would type
 * the URL by hand. `user`/`password`/`database` are percent-encoded so a special character in a
 * password doesn't corrupt the resulting URL's structure.
 */
export function composeConnectionString(fields: ConnectionFields): string {
  const host = fields.host.trim() || "localhost";
  const port = fields.port.trim() || FIELD_ENGINE_DEFAULT_PORT[fields.engine];
  const user = fields.user.trim();
  const password = fields.password.trim();
  const database = fields.database.trim();

  const auth = user
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  const path = database ? `/${encodeURIComponent(database)}` : "";
  return `${fields.engine}://${auth}${host}:${port}${path}`;
}

const FIELD_ENGINE_BY_PROTOCOL: Record<string, FieldEngine> = {
  "postgres:": "postgres",
  "postgresql:": "postgres",
  "mysql:": "mysql",
  "mongodb:": "mongodb",
  "mongodb+srv:": "mongodb"
};

/**
 * The inverse of `composeConnectionString` - splits a pasted full connection string back into
 * discrete fields, so pasting a URL into any single field-mode input (not just a dedicated "paste
 * here" box) fills in the whole form instead of dropping the raw string into that one field.
 * Returns null for anything that isn't a URL with a supported engine scheme, so an ordinary paste
 * (e.g. just a hostname) falls through to the default single-field paste behavior.
 */
export function parsePastedConnectionString(text: string): ConnectionFields | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }

  const engine = FIELD_ENGINE_BY_PROTOCOL[url.protocol];
  if (!engine) return null;

  const database = url.pathname.replace(/^\//, "");
  return {
    engine,
    host: url.hostname,
    port: url.port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: database ? decodeURIComponent(database) : ""
  };
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
  /** Sibling databases on the current server (F115/F116) - omit the whole "Databases on this
   * server" section (e.g. SQLite, which has no database-list concept, or no connection yet) by
   * leaving `databases` undefined and `onSwitchDatabase`/`onCreateDatabase`/`onDropDatabase` unset. */
  databases?: string[];
  databasesLoading?: boolean;
  databasesError?: string;
  currentDatabase?: string;
  canManageDatabases?: boolean;
  /** Why `canManageDatabases` is false, e.g. "Qyre was started with --read-only." */
  databaseManagementReason?: string;
  onSwitchDatabase?: (database: string) => Promise<void>;
  onCreateDatabase?: (database: string) => Promise<void>;
  onDropDatabase?: (database: string) => Promise<void>;
}

/**
 * A right-anchored slide-in drawer (same pattern as `QueryHistoryDrawer`/`CellValueDrawer`) for
 * switching the running Qyre instance to a different database connection without restarting the
 * CLI (F064). See docs/product-specs/database-switching.md.
 */
const EMPTY_FIELDS: ConnectionFields = {
  engine: "postgres",
  host: "",
  port: "",
  user: "",
  password: "",
  database: ""
};

function Field({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="font-mono text-[10px] text-muted-foreground/70">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ConnectDrawer({
  open,
  onOpenChange,
  currentTarget,
  recentTargets,
  onConnect,
  isConnecting,
  databases,
  databasesLoading,
  databasesError,
  currentDatabase,
  canManageDatabases,
  databaseManagementReason,
  onSwitchDatabase,
  onCreateDatabase,
  onDropDatabase
}: ConnectDrawerProps): ReactNode {
  const asideRef = useRef<HTMLElement | null>(null);
  useFocusTrap(asideRef, open);
  const [mode, setMode] = useState<"url" | "fields">("url");
  const [value, setValue] = useState("");
  const [fields, setFields] = useState<ConnectionFields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | undefined>();

  // The drawer never unmounts (it's always rendered, just translated off-canvas when closed - see
  // the `aside` below), so a leftover draft from a prior open/cancel would otherwise still be
  // sitting in the form the next time it opens. Reset on every open so switching databases always
  // starts from a clean slate, not whatever was last typed.
  useEffect(() => {
    if (!open) return;
    setMode("url");
    setValue("");
    setFields(EMPTY_FIELDS);
    setError(undefined);
  }, [open]);

  async function attemptConnect(raw: string): Promise<void> {
    const trimmed = raw.trim();
    if (!trimmed || isConnecting) return;
    setError(undefined);
    try {
      await onConnect(trimmed);
      setValue("");
      setFields(EMPTY_FIELDS);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : String(connectError));
    }
  }

  function handleUrlSubmit(event: FormEvent): void {
    event.preventDefault();
    void attemptConnect(value);
  }

  function handleFieldsSubmit(event: FormEvent): void {
    event.preventDefault();
    void attemptConnect(composeConnectionString(fields));
  }

  function updateField<Key extends keyof ConnectionFields>(
    key: Key,
    fieldValue: ConnectionFields[Key]
  ): void {
    setFields((current) => ({ ...current, [key]: fieldValue }));
  }

  function handleFieldPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const parsed = parsePastedConnectionString(event.clipboardData.getData("text"));
    if (!parsed) return;
    event.preventDefault();
    setFields(parsed);
    setError(undefined);
  }

  const inputClass =
    "rounded-[3px] border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-50";

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
          "fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-border bg-card outline-none transition-transform duration-150",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="m-0 text-[13px] font-medium text-foreground">Switch database</h2>
          <button
            type="button"
            aria-label="Close connection settings"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="rounded-[4px] border border-border bg-background px-3 py-2">
            <p className="m-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              Current
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-foreground/80">
              {currentTarget ?? "Not connected"}
            </p>
          </div>

          {databases !== undefined && onSwitchDatabase && onCreateDatabase && onDropDatabase && (
            <DatabasePanel
              databases={databases}
              loading={databasesLoading ?? false}
              loadError={databasesError}
              currentDatabase={currentDatabase}
              canManage={canManageDatabases ?? false}
              hiddenReason={databaseManagementReason}
              onSwitch={onSwitchDatabase}
              onCreate={onCreateDatabase}
              onDrop={onDropDatabase}
            />
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <h3 className="m-0 text-[12px] font-medium text-foreground">New connection</h3>
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === "url" ? "fields" : "url"));
                setError(undefined);
              }}
              className="shrink-0 font-mono text-[10px] text-primary underline decoration-dotted underline-offset-2 hover:opacity-80"
            >
              {mode === "url" ? "Use fields instead" : "Paste a URL instead"}
            </button>
          </div>

          {mode === "url" ? (
            <form onSubmit={handleUrlSubmit} className="mt-2.5 flex flex-col gap-2">
              <label htmlFor="connect-target-input" className="sr-only">
                Connection string or SQLite file path
              </label>
              <input
                id="connect-target-input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={isConnecting}
                placeholder="postgres://user:pass@host:5432/db"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={isConnecting || !value.trim()}
                className="flex items-center justify-center gap-1.5 rounded-[3px] bg-primary px-2 py-1.5 font-mono text-[11px] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting && <Spinner className="text-primary-foreground" />}
                Connect
              </button>
            </form>
          ) : (
            <form onSubmit={handleFieldsSubmit} className="mt-2.5 flex flex-col gap-2.5">
              <Segmented
                aria-label="Engine"
                value={fields.engine}
                onChange={(engine) => setFields({ ...EMPTY_FIELDS, engine })}
                options={(["postgres", "mysql", "mongodb"] as const).map((engine) => ({
                  value: engine,
                  label: FIELD_ENGINE_LABEL[engine]
                }))}
              />

              <div className="flex gap-2">
                <Field id="connect-field-host" label="Host">
                  <input
                    id="connect-field-host"
                    value={fields.host}
                    onChange={(event) => updateField("host", event.target.value)}
                    onPaste={handleFieldPaste}
                    disabled={isConnecting}
                    placeholder="localhost"
                    className={cn(inputClass, "w-full")}
                  />
                </Field>
                <div className="w-20 shrink-0">
                  <Field id="connect-field-port" label="Port">
                    <input
                      id="connect-field-port"
                      value={fields.port}
                      onChange={(event) => updateField("port", event.target.value)}
                      onPaste={handleFieldPaste}
                      disabled={isConnecting}
                      placeholder={FIELD_ENGINE_DEFAULT_PORT[fields.engine]}
                      className={cn(inputClass, "w-full")}
                    />
                  </Field>
                </div>
              </div>

              <Field id="connect-field-user" label="User">
                <input
                  id="connect-field-user"
                  value={fields.user}
                  onChange={(event) => updateField("user", event.target.value)}
                  onPaste={handleFieldPaste}
                  disabled={isConnecting}
                  placeholder="optional"
                  className={inputClass}
                />
              </Field>

              <Field id="connect-field-password" label="Password">
                <input
                  id="connect-field-password"
                  type="password"
                  value={fields.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  onPaste={handleFieldPaste}
                  disabled={isConnecting}
                  placeholder="optional"
                  className={inputClass}
                />
              </Field>

              <Field id="connect-field-database" label="Database">
                <input
                  id="connect-field-database"
                  value={fields.database}
                  onChange={(event) => updateField("database", event.target.value)}
                  onPaste={handleFieldPaste}
                  disabled={isConnecting}
                  placeholder="optional"
                  className={inputClass}
                />
              </Field>

              <button
                type="submit"
                disabled={isConnecting}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-[3px] bg-primary px-2 py-1.5 font-mono text-[11px] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting && <Spinner className="text-primary-foreground" />}
                Connect
              </button>
            </form>
          )}

          {error && (
            <p
              role="alert"
              className="mt-2 font-mono text-[11px]"
              style={{ color: "var(--c-red)" }}
            >
              {error}
            </p>
          )}

          {recentTargets.length > 0 && (
            <div className="mt-5">
              <p className="m-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
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
