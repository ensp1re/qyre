import type { HealthResponse } from "@qyre/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch the server's health/connection status. */
export function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/api/health");
}
