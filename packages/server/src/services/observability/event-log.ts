import type { ConsoleEvent, ConsoleEventLevel } from "@qyre/core";

const MAX_EVENTS = 200;

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
