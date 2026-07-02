import type { ConsoleEvent } from "@humb/core";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export interface ConsoleLogProps {
  events: ConsoleEvent[];
  onClear: () => void;
}

const LEVEL_COLOR: Record<ConsoleEvent["level"], string | undefined> = {
  info: undefined,
  warn: "var(--c-amber)",
  error: "var(--c-red)"
};

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });
}

/** A read-only stream of recent connection/query events (DF-07), with a client-side Clear action. */
export function ConsoleLog({ events, onClear }: ConsoleLogProps): ReactNode {
  return (
    <div
      data-testid="console-log"
      className="flex h-full flex-col overflow-hidden rounded-[3px] border border-border"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Console
        </span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        >
          <Trash2 className="h-2.5 w-2.5" />
          Clear
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-auto p-3">
        {events.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground/50">No events yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 py-0.5 font-mono text-[11px]">
              <span className="shrink-0 tabular-nums text-muted-foreground/30">
                {formatTime(event.timestamp)}
              </span>
              <span
                className="w-9 shrink-0 text-right text-[10px]"
                style={{ color: LEVEL_COLOR[event.level] }}
              >
                {event.level === "info" ? (
                  <span className="text-muted-foreground/40">{event.level}</span>
                ) : (
                  event.level
                )}
              </span>
              <span
                className={event.level === "info" ? "text-foreground/65" : ""}
                style={{ color: LEVEL_COLOR[event.level] }}
              >
                {event.message}
              </span>
            </div>
          ))
        )}
        <div className="flex items-center gap-1.5 pt-2">
          <span className="font-mono text-[11px]" style={{ color: "var(--c-green)" }}>
            ❯
          </span>
          <span className="animate-pulse font-mono text-[11px] text-muted-foreground/25">█</span>
        </div>
      </div>
    </div>
  );
}
