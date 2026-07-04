import type { AllTablesResponse } from "@humbdb/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch every table's metadata across every schema in one request (F027). */
export function fetchAllTables(): Promise<AllTablesResponse> {
  return fetchJson<AllTablesResponse>("/api/tables");
}
