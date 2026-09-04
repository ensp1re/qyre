import type { DatabaseOverview } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchOverview(): Promise<DatabaseOverview> {
  return fetchJson<DatabaseOverview>("/api/overview");
}
