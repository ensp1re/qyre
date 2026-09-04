import type { ConsoleEvents } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchConsoleEvents(): Promise<ConsoleEvents> {
  return fetchJson<ConsoleEvents>("/api/console");
}

export function clearConsoleEvents(): Promise<ConsoleEvents> {
  return fetchJson<ConsoleEvents>("/api/console", { method: "DELETE" });
}
