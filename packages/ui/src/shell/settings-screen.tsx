import type { AccessOverview, ConnectionStatus } from "@qyre/core";
import { Database, History, Moon, Sun, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AccessViewer } from "../access/access-viewer.js";
import { Segmented } from "../primitives/segmented.js";

export interface SettingsScreenProps {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onClose: () => void;
  connectionStatus: ConnectionStatus;
  connectionTarget: string | null;
  /** Opens the connection switcher (the drawer that used to hide behind the gear). */
  onOpenConnection: () => void;
  queryHistoryCount: number;
  onClearQueryHistory: () => void;
  recentConnectionsCount: number;
  onClearRecentConnections: () => void;
  accessSupported?: boolean;
  accessOverview?: AccessOverview;
  accessLoading: boolean;
  accessError: boolean;
  onRetryAccess: () => void;
}

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "bg-[var(--c-green)]",
  disconnected: "bg-[var(--c-red)]",
  unconfigured: "bg-muted-foreground"
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  unconfigured: "No database"
};

/**
 * A full-screen, grouped configuration view (F087). Every control applies immediately - there is
 * no separate save/discard step. It replaces the old one-off panel where the title-bar gear
 * silently opened the connection drawer - that switcher now lives in its own labeled section here
 * and behind its own title-bar button.
 */
export function SettingsScreen({
  theme,
  onThemeChange,
  onClose,
  connectionStatus,
  connectionTarget,
  onOpenConnection,
  queryHistoryCount,
  onClearQueryHistory,
  recentConnectionsCount,
  onClearRecentConnections,
  accessSupported,
  accessOverview,
  accessLoading,
  accessError,
  onRetryAccess
}: SettingsScreenProps): ReactNode {
  return (
    <div data-testid="settings-screen" className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="m-0 text-[13px] font-medium text-foreground">Settings</h2>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
          <Section
            title="Connection"
            description="The database this Qyre instance is currently attached to."
          >
            <Row label="Active database" hint={STATUS_LABEL[connectionStatus]}>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    STATUS_DOT_COLOR[connectionStatus]
                  )}
                />
                <span className="truncate font-mono text-[11px] text-foreground/80">
                  {connectionTarget ?? "Not connected"}
                </span>
              </div>
            </Row>
            <Row label="Switch database" hint="Point this instance at a different connection.">
              <ActionButton icon={<Database className="h-3 w-3" />} onClick={onOpenConnection}>
                Switch
              </ActionButton>
            </Row>
          </Section>

          <Section
            title="Access"
            description="Current identity, active roles, effective grants, and read-only access facts."
          >
            <AccessViewer
              connectionStatus={connectionStatus}
              supported={accessSupported}
              overview={accessOverview}
              isLoading={accessLoading}
              isError={accessError}
              onRetry={onRetryAccess}
            />
          </Section>

          <Section title="Appearance" description="How the workspace looks.">
            <Row label="Theme" hint="Dark is the default for this developer tool.">
              <Segmented
                value={theme}
                onChange={onThemeChange}
                options={[
                  { value: "light", label: "Light", icon: <Sun className="h-3 w-3" /> },
                  { value: "dark", label: "Dark", icon: <Moon className="h-3 w-3" /> }
                ]}
              />
            </Row>
          </Section>

          <Section
            title="Data & history"
            description="Locally-stored lists. Clearing removes them from this browser only."
          >
            <Row
              label="Query history"
              hint={`${queryHistoryCount} saved ${plural(queryHistoryCount, "query", "queries")}`}
            >
              <ActionButton
                icon={<History className="h-3 w-3" />}
                onClick={onClearQueryHistory}
                disabled={queryHistoryCount === 0}
                ariaLabel="Clear query history"
                destructive
              >
                Clear
              </ActionButton>
            </Row>
            <Row label="Recent connections" hint={`${recentConnectionsCount} remembered`}>
              <ActionButton
                icon={<Trash2 className="h-3 w-3" />}
                onClick={onClearRecentConnections}
                disabled={recentConnectionsCount === 0}
                ariaLabel="Clear recent connections"
                destructive
              >
                Clear
              </ActionButton>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function Section({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="rounded-[4px] border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h3 className="m-0 text-[12px] font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <p className="m-0 text-[12px] text-foreground">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ActionButton({
  icon,
  onClick,
  disabled,
  destructive,
  ariaLabel,
  children
}: {
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        destructive
          ? "border-border text-[var(--c-red)] hover:border-[var(--c-red)]/50 hover:bg-[var(--c-red)]/10"
          : "border-border text-foreground/80 hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
