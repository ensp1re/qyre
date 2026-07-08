import type { HealthResponse } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Fetch the server's health/connection status. */
export function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/api/health");
}
