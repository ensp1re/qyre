import type { CancelOperationResult } from "@qyre/core";
import { fetchJson } from "./fetch-json.js";

export function cancelOperation(operationId: string): Promise<CancelOperationResult> {
  return fetchJson<CancelOperationResult>(
    `/api/operations/${encodeURIComponent(operationId)}/cancel`,
    { method: "POST" }
  );
}
