import { DATABASE_ENGINES, REMOTE_DATABASE_ENGINES } from "@qyre/core/connection-constants";
import { Database, X } from "lucide-react";
import type { ClipboardEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn.js";
import { Spinner } from "../feedback/spinner.js";
import { Segmented } from "../primitives/segmented.js";
import { useFocusTrap } from "../primitives/use-focus-trap.js";
import { DatabasePanel } from "./database-panel.js";
import type { ConnectionFields, FieldEngine, RecentTarget } from "./types.js";

export type { ConnectionFields, FieldEngine, RecentTarget } from "./types.js";

export const FIELD_ENGINE_DEFAULT_PORT: Record<FieldEngine, string> = {
  [DATABASE_ENGINES.postgres]: "5432",
  [DATABASE_ENGINES.mysql]: "3306",
  [DATABASE_ENGINES.mongodb]: "27017"
};

const FIELD_ENGINE_LABEL: Record<FieldEngine, string> = {
  [DATABASE_ENGINES.postgres]: "Postgres",
  [DATABASE_ENGINES.mysql]: "MySQL",
  [DATABASE_ENGINES.mongodb]: "MongoDB"
};

export function composeConnectionString(fields: ConnectionFields): string {
  const host = fields.host.trim() || "localhost";
  const user = fields.user.trim();
  const password = fields.password.trim();
  const database = fields.database.trim();

  const auth = user
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  const path = database ? `/${encodeURIComponent(database)}` : "";
  if (fields.engine === DATABASE_ENGINES.mongodb && fields.srv) {
    return `mongodb+srv://${auth}${host}${path}`;
  }
  const port = fields.port.trim() || FIELD_ENGINE_DEFAULT_PORT[fields.engine];
  return `${fields.engine}://${auth}${host}:${port}${path}`;
}

const FIELD_ENGINE_BY_PROTOCOL: Record<string, FieldEngine> = {
  "postgres:": DATABASE_ENGINES.postgres,
  "postgresql:": DATABASE_ENGINES.postgres,
  "mysql:": DATABASE_ENGINES.mysql,
  "mongodb:": DATABASE_ENGINES.mongodb,
  "mongodb+srv:": DATABASE_ENGINES.mongodb
};

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
    database: database ? decodeURIComponent(database) : "",
    srv: url.protocol === "mongodb+srv:"
  };
}

export interface ConnectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTarget: string | null;
  recentTargets: RecentTarget[];
  onConnect: (raw: string) => Promise<void>;
  isConnecting: boolean;
  databases?: string[];
  databasesLoading?: boolean;
  databasesError?: string;
  currentDatabase?: string;
  canManageDatabases?: boolean;
  databaseManagementReason?: string;
  onSwitchDatabase?: (database: string) => Promise<void>;
  onCreateDatabase?: (database: string) => Promise<void>;
  onDropDatabase?: (database: string) => Promise<void>;
}

const EMPTY_FIELDS: ConnectionFields = {
  engine: DATABASE_ENGINES.postgres,
  host: "",
  port: "",
  user: "",
  password: "",
  database: "",
  srv: false
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
      <label htmlFor={id} className="font-mono text-[10px] text-quiet-foreground">
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
    "rounded-[3px] border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-quiet-foreground disabled:opacity-50";

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
            <p className="m-0 font-mono text-[9px] uppercase tracking-widest text-quiet-foreground">
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
                options={REMOTE_DATABASE_ENGINES.map((engine) => ({
                  value: engine,
                  label: FIELD_ENGINE_LABEL[engine]
                }))}
              />

              {fields.engine === DATABASE_ENGINES.mongodb && (
                <label className="flex items-center gap-1.5 font-mono text-[10px] text-quiet-foreground">
                  <input
                    type="checkbox"
                    checked={fields.srv}
                    onChange={(event) => updateField("srv", event.target.checked)}
                    disabled={isConnecting}
                  />
                  SRV (mongodb+srv, e.g. Atlas - no port)
                </label>
              )}

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
                      value={fields.srv ? "" : fields.port}
                      onChange={(event) => updateField("port", event.target.value)}
                      onPaste={handleFieldPaste}
                      disabled={isConnecting || fields.srv}
                      placeholder={fields.srv ? "n/a" : FIELD_ENGINE_DEFAULT_PORT[fields.engine]}
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
              <p className="m-0 font-mono text-[9px] uppercase tracking-widest text-quiet-foreground">
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
                      title={recent.display}
                      className="w-full truncate rounded-[3px] border border-border bg-background p-2 text-left font-mono text-[11px] text-foreground/80 transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
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
