import type { AccessOverview, ConnectionStatus } from "@qyre/core";
import { Database, History, Moon, Palette, ShieldCheck, Sun, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../cn.js";
import { AccessViewer } from "../access/access-viewer.js";
import { IconButton } from "../primitives/controls/icon-button.js";
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

type SettingsCategory = "connection" | "access" | "appearance" | "data";

const SETTINGS_CATEGORIES = [
  { id: "connection", label: "Connection", icon: Database },
  { id: "access", label: "Access", icon: ShieldCheck },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data & history", icon: History }
] as const;

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
  const [category, setCategory] = useState<SettingsCategory>("connection");
  const categoryLabel = SETTINGS_CATEGORIES.find((item) => item.id === category)?.label;

  return (
    <div data-testid="settings-screen" className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-2.5">
        <h2 className="m-0 text-[12px] font-medium text-foreground">Settings</h2>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="text-[10px] text-muted-foreground">{categoryLabel}</span>
        <IconButton
          variant="ghost"
          label="Close settings"
          onClick={onClose}
          icon={<X className="h-3.5 w-3.5" />}
          className="ml-auto h-7 w-7"
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings categories"
          className="w-44 shrink-0 border-r border-border bg-sidebar py-1.5"
        >
          {SETTINGS_CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={category === id ? "page" : undefined}
              onClick={() => setCategory(id)}
              className={cn(
                "mx-1 flex min-h-7 w-[calc(100%-0.5rem)] items-center gap-2 rounded-[2px] px-2 text-left text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                category === id
                  ? "bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_rgb(var(--primary))]"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl">
            {category === "connection" && (
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
            )}

            {category === "access" && (
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
            )}

            {category === "appearance" && (
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
            )}

            {category === "data" && (
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
            )}
          </div>
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
    <section>
      <div className="border-b border-border bg-card px-4 py-3">
        <h3 className="m-0 text-[12px] font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col divide-y divide-border-subtle">{children}</div>
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
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
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
