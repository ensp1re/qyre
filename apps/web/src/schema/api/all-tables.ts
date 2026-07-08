import type { AllTablesResponse } from "@qyre/core";
import { fetchJson } from "../../shared/api/fetch-json.js";

/** Fetch every table's metadata across every schema in one request (F027). */
export function fetchAllTables(): Promise<AllTablesResponse> {
  return fetchJson<AllTablesResponse>("/api/tables");
}
