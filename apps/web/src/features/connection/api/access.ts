import type { AccessOverview } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchAccessOverview(): Promise<AccessOverview> {
  return fetchJson<AccessOverview>("/api/access");
}
