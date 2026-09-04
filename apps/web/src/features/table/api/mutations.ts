import type { CommitMutationsResult, MutationOp } from "@qyre/core";
import { fetchMutation } from "../../../shared/api/fetch-mutation.js";

export function commitMutations(ops: MutationOp[]): Promise<CommitMutationsResult> {
  return fetchMutation<CommitMutationsResult>("/api/mutations/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops })
  });
}
