import type { ConsoleEvent } from "@qyre/core";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../cn.js";
import {
  CommandGroup,
  CommandSeparator,
  CommandToolbar
} from "../primitives/controls/command-toolbar.js";
import { IconButton } from "../primitives/controls/icon-button.js";

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

export function ConsoleLog({ events, onClear }: ConsoleLogProps): ReactNode {
  const [level, setLevel] = useState<"all" | ConsoleEvent["level"]>("all");
  const visibleEvents = level === "all" ? events : events.filter((event) => event.level === level);

  return (
    <div data-testid="console-log" className="flex h-full flex-col overflow-hidden">
      <CommandToolbar label="Console commands">
        <CommandGroup label="Event level">
          {(["all", "info", "warn", "error"] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-command-item
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
              className={cn(
                "h-6 rounded-[3px] px-2 font-mono text-[10px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary",
                level === option
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              {option === "all" ? "All" : option}
            </button>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <span className="font-mono text-[10px] text-quiet-foreground">
          {visibleEvents.length} event{visibleEvents.length === 1 ? "" : "s"}
        </span>
        <CommandGroup label="Console utilities" className="ml-auto">
          <IconButton
            data-command-item
            variant="ghost"
            label="Clear console"
            onClick={onClear}
            disabled={events.length === 0}
            icon={<Trash2 className="h-3 w-3" />}
            className="h-6 w-6"
          />
        </CommandGroup>
      </CommandToolbar>

      <div className="flex-1 space-y-0.5 overflow-auto p-3">
        {visibleEvents.length === 0 ? (
          <p className="font-mono text-[11px] text-quiet-foreground">
            {level === "all" ? "No events yet." : `No ${level} events.`}
          </p>
        ) : (
          visibleEvents.map((event) => (
            <div key={event.id} className="flex items-start gap-3 py-0.5 font-mono text-[11px]">
              <span className="shrink-0 tabular-nums text-quiet-foreground">
                {formatTime(event.timestamp)}
              </span>
              <span
                className="w-9 shrink-0 text-right text-[10px]"
                style={{ color: LEVEL_COLOR[event.level] }}
              >
                {event.level === "info" ? (
                  <span className="text-quiet-foreground">{event.level}</span>
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
      </div>
    </div>
  );
}
