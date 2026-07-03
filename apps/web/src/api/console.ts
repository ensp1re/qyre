import type { ConsoleEvents } from "@humbdb/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch the Console tab's recent connection/query events. */
export function fetchConsoleEvents(): Promise<ConsoleEvents> {
  return fetchJson<ConsoleEvents>("/api/console");
}

/** Clear the server's in-memory event log. */
export function clearConsoleEvents(): Promise<ConsoleEvents> {
  return fetchJson<ConsoleEvents>("/api/console", { method: "DELETE" });
}
