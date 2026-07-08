import type { ConnectResponse } from "@qyre/core";
import { fetchJson } from "../../shared/api/fetch-json.js";

/** Switch the running server to a different database connection (F064). Throws with the server's
 * actual rejection reason (e.g. bad credentials, unreachable host) on failure. */
export function connectToTarget(target: string): Promise<ConnectResponse> {
  return fetchJson<ConnectResponse>("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target })
  });
}
