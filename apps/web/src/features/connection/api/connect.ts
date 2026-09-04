import type { ConnectResponse } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function connectToTarget(target: string): Promise<ConnectResponse> {
  return fetchJson<ConnectResponse>("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target })
  });
}
