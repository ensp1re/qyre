import type { ConsoleEvent, ConsoleEventLevel } from "@humb/core";

const MAX_EVENTS = 200;

/**
 * A bounded, in-memory log of recent connection/query events for the Console tab - no persistence
 * requirement (docs/product-specs/dashboard-ui.md). A plain array with the oldest entry dropped
 * once the cap is hit, not a literal ring-buffer data structure - 200 is far too small a bound for
 * that complexity to pay for itself.
 */
export class EventLog {
  private events: ConsoleEvent[] = [];
  private nextId = 1;

  log(level: ConsoleEventLevel, message: string): void {
    this.events.push({ id: this.nextId++, timestamp: new Date().toISOString(), level, message });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }
  }

  list(): ConsoleEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }
}
