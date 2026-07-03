import type { DatabaseOverview } from "@humbdb/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch the database's schemas and tables. */
export function fetchOverview(): Promise<DatabaseOverview> {
  return fetchJson<DatabaseOverview>("/api/overview");
}
