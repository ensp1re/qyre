import type { RowPage } from "@qyre/core";
import { fetchJson } from "./fetch-json.js";

/** Run a read-only SQL query. Throws with the server's actual rejection reason on failure. */
export function runQuery(sql: string): Promise<RowPage> {
  return fetchJson<RowPage>("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
}
