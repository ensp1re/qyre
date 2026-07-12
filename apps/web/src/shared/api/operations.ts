import type { CancelOperationResult } from "@qyre/core";
import { fetchJson } from "./fetch-json.js";

/** Cancels a still-running query or rows fetch by the client-generated `operationId` it was
 * started with (F126). `cancelled: false` isn't an error - the operation may already have
 * finished, or the connected engine may have no real cancellation mechanism (SQLite). */
export function cancelOperation(operationId: string): Promise<CancelOperationResult> {
  return fetchJson<CancelOperationResult>(
    `/api/operations/${encodeURIComponent(operationId)}/cancel`,
    { method: "POST" }
  );
}
