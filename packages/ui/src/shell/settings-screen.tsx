import type { ConnectionStatus } from "@qyre/core";
import {
  Check,
  Database,
  History,
  LayoutGrid,
  Moon,
  Network,
  PanelLeft,
  RotateCcw,
  Sun,
  Table2,
  Trash2,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "../cn.js";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "../schema/sidebar.js";
import {
  RESULTS_DEFAULT_HEIGHT,
  RESULTS_MAX_HEIGHT,
  RESULTS_MIN_HEIGHT
} from "../query/query-runner.js";

/** The user-editable workspace preferences the Settings screen stages and saves as one unit. The
 * caller (apps/web) owns persistence; this package stays presentation-only per FRONTEND.md. */
export interface QyreSettings {
  theme: "light" | "dark";
  /** Which Schema-tab view opens by default (F074's graph or the card grid). */
  schemaView: "graph" | "grid";
  sidebarWidth: number;
  resultsHeight: number;
}

export interface SettingsScreenProps {
  /** The persisted, currently-applied preferences - the baseline the staged draft diffs against. */
  settings: QyreSettings;
  /** Applies the staged draft. Called only when there are unsaved changes. */
  onSave: (next: QyreSettings) => void;
  onClose: () => void;
  connectionStatus: ConnectionStatus;
  connectionTarget: string | null;
  /** Opens the connection switcher (the drawer that used to hide behind the gear). */
  onOpenConnection: () => void;
  queryHistoryCount: number;
  onClearQueryHistory: () => void;
  recentConnectionsCount: number;
  onClearRecentConnections: () => void;
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

function settingsEqual(a: QyreSettings, b: QyreSettings): boolean {
  return (
    a.theme === b.theme &&
    a.schemaView === b.schemaView &&
    a.sidebarWidth === b.sidebarWidth &&
    a.resultsHeight === b.resultsHeight
  );
}

/**
 * A full-screen, grouped configuration view (F087). Edits are staged into a local draft so the
 * saved-vs-unsaved state is explicit: nothing is applied until Save, and Discard restores the
 * baseline. It replaces the old one-off panel where the title-bar gear silently opened the
 * connection drawer - that switcher now lives in its own labeled section here and in the title bar.
 */
export function SettingsScreen({
  settings,
  onSave,
  onClose,
  connectionStatus,
  connectionTarget,
  onOpenConnection,
  queryHistoryCount,
  onClearQueryHistory,
  recentConnectionsCount,
  onClearRecentConnections
}: SettingsScreenProps): ReactNode {
  const [draft, setDraft] = useState<QyreSettings>(settings);

  // Re-seed the draft when the applied settings change under us (e.g. Save elsewhere, or the screen
  // reopening after a discard) so a stale draft never masks the real baseline.
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = !settingsEqual(draft, settings);

  function update<Key extends keyof QyreSettings>(key: Key, value: QyreSettings[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div data-testid="settings-screen" className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="m-0 text-[13px] font-medium text-foreground">Settings</h2>
        <span
          data-testid="settings-dirty-badge"
          className={cn(
            "flex items-center gap-1 font-mono text-[10px]",
            dirty ? "text-[var(--c-amber)]" : "text-muted-foreground/60"
          )}
        >
          {dirty ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-amber)]" />
              Unsaved changes
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              All changes saved
            </>
          )}
        </span>
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

          <Section title="Appearance" description="How the workspace looks.">
            <Row label="Theme" hint="Dark is the default for this developer tool.">
              <Segmented
                value={draft.theme}
                onChange={(value) => update("theme", value)}
                options={[
                  { value: "light", label: "Light", icon: <Sun className="h-3 w-3" /> },
                  { value: "dark", label: "Dark", icon: <Moon className="h-3 w-3" /> }
                ]}
              />
            </Row>
          </Section>

          <Section title="Layout" description="Default sizing and views for the workspace panels.">
            <Row label="Schema default view" hint="Which Schema tab layout opens first.">
              <Segmented
                value={draft.schemaView}
                onChange={(value) => update("schemaView", value)}
                options={[
                  { value: "graph", label: "Graph", icon: <Network className="h-3 w-3" /> },
                  { value: "grid", label: "Grid", icon: <LayoutGrid className="h-3 w-3" /> }
                ]}
              />
            </Row>
            <Row label="Sidebar width" hint={`${SIDEBAR_MIN_WIDTH}–${SIDEBAR_MAX_WIDTH}px`}>
              <NumberField
                value={draft.sidebarWidth}
                min={SIDEBAR_MIN_WIDTH}
                max={SIDEBAR_MAX_WIDTH}
                defaultValue={SIDEBAR_DEFAULT_WIDTH}
                icon={<PanelLeft className="h-3 w-3" />}
                ariaLabel="Sidebar width in pixels"
                onChange={(value) => update("sidebarWidth", value)}
              />
            </Row>
            <Row
              label="Results panel height"
              hint={`${RESULTS_MIN_HEIGHT}–${RESULTS_MAX_HEIGHT}px`}
            >
              <NumberField
                value={draft.resultsHeight}
                min={RESULTS_MIN_HEIGHT}
                max={RESULTS_MAX_HEIGHT}
                defaultValue={RESULTS_DEFAULT_HEIGHT}
                icon={<Table2 className="h-3 w-3" />}
                ariaLabel="Results panel height in pixels"
                onChange={(value) => update("resultsHeight", value)}
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

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 py-2.5">
        <button
          type="button"
          onClick={() => setDraft(settings)}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-[3px] border border-border px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          Discard
        </button>
        <button
          type="button"
          data-testid="settings-save"
          onClick={() => onSave(draft)}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-[3px] bg-primary px-3 py-1.5 font-mono text-[11px] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          Save changes
        </button>
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

function Segmented<Value extends string>({
  value,
  onChange,
  options
}: {
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string; icon: ReactNode }[];
}): ReactNode {
  return (
    <div className="flex items-center gap-0.5 rounded-[3px] border border-border bg-background p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[11px] transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  value,
  min,
  max,
  defaultValue,
  icon,
  ariaLabel,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  icon: ReactNode;
  ariaLabel: string;
  onChange: (value: number) => void;
}): ReactNode {
  function clamp(next: number): number {
    if (!Number.isFinite(next)) return value;
    return Math.min(max, Math.max(min, Math.round(next)));
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 rounded-[3px] border border-border bg-background px-2 py-1">
        <span className="text-muted-foreground">{icon}</span>
        <input
          type="number"
          aria-label={ariaLabel}
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(clamp(event.target.valueAsNumber))}
          className="w-14 bg-transparent font-mono text-[11px] text-foreground outline-none"
        />
        <span className="font-mono text-[10px] text-muted-foreground">px</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(defaultValue)}
        disabled={value === defaultValue}
        aria-label={`Reset ${ariaLabel} to default`}
        title={`Reset to ${defaultValue}px`}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RotateCcw className="h-3 w-3" />
      </button>
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
