import { getAuthToken } from "./auth-token.js";
import { apiResponseError } from "./permission-denied.js";

/**
 * Fetch wrapper for a mutation route whose `409 Conflict` is a normal, typed outcome the caller
 * needs to react to (F102's batch commit, F125's document save/delete) - not an exceptional one.
 * Unlike `fetchJson`, which throws on every non-2xx and discards the response body, this returns
 * the `409` body as-is so the caller can read whatever conflict details it carries (e.g.
 * `CommitMutationsResult`'s `failedIndex`). Any other non-2xx status still throws, same as
 * `fetchJson`.
 */
export async function fetchMutation<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  if (response.status === 409) {
    return (await response.json()) as T;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw apiResponseError(body, response.status);
  }

  return (await response.json()) as T;
}
