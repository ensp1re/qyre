import type { ConsoleEvents } from "@humbdb/core";

/** Fetch the Console tab's recent connection/query events. */
export async function fetchConsoleEvents(): Promise<ConsoleEvents> {
  const response = await fetch("/api/console");
  if (!response.ok) {
    throw new Error(`Failed to load console events (status ${response.status})`);
  }
  return (await response.json()) as ConsoleEvents;
}

/** Clear the server's in-memory event log. */
export async function clearConsoleEvents(): Promise<ConsoleEvents> {
  const response = await fetch("/api/console", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to clear console events (status ${response.status})`);
  }
  return (await response.json()) as ConsoleEvents;
}
