import type { CommitMutationsResult, MutationOp } from "@qyre/core";
import { fetchMutation } from "../../../shared/api/fetch-mutation.js";

/**
 * Commits a batch of staged operations (F102's `POST /api/mutations/commit`). Uses `fetchMutation`,
 * not the shared `fetchJson` helper: a `409` rollback is a normal, typed outcome here
 * (`CommitMutationsResult`'s own `{ committed: false, failedIndex }` variant), not an exceptional
 * one - `fetchJson` throws on any non-2xx and discards the response body, which would lose
 * `failedIndex` and force the caller to re-derive which staged operation actually failed.
 */
export function commitMutations(ops: MutationOp[]): Promise<CommitMutationsResult> {
  return fetchMutation<CommitMutationsResult>("/api/mutations/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops })
  });
}
