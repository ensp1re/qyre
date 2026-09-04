import type { AllTablesResponse } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchAllTables(): Promise<AllTablesResponse> {
  return fetchJson<AllTablesResponse>("/api/tables");
}
