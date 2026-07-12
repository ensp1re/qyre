import type { CommitMutationsResult, MutationOp } from "@qyre/core";
import { getAuthToken } from "../../../shared/api/auth-token.js";

/**
 * Commits a batch of staged operations (F102's `POST /api/mutations/commit`). Deliberately doesn't
 * reuse the shared `fetchJson` helper: a `409` rollback is a normal, typed outcome here
 * (`CommitMutationsResult`'s own `{ committed: false, failedIndex }` variant), not an exceptional
 * one - `fetchJson` throws on any non-2xx and discards the response body, which would lose
 * `failedIndex` and force the caller to re-derive which staged operation actually failed.
 */
export async function commitMutations(ops: MutationOp[]): Promise<CommitMutationsResult> {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch("/api/mutations/commit", {
      method: "POST",
      headers,
      body: JSON.stringify({ ops })
    });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  if (response.status === 409) {
    return (await response.json()) as CommitMutationsResult;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? `Request failed (status ${response.status}).`);
  }

  return (await response.json()) as CommitMutationsResult;
}
