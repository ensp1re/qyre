/**
 * Shared fetch wrapper for every `api/*.ts` fetcher (F017).
 *
 * Distinguishes the two ways a request can fail:
 * - The request never reached a server at all (`fetch()` itself rejects - server not running,
 *   network down, CORS, ...) - browsers surface this as a generic message ("Failed to fetch") with
 *   no indication of what actually happened, so this replaces it with something a developer can act
 *   on.
 * - The server responded with an error - reads the real message from the JSON body's `error` field
 *   (the shape `packages/server`'s global error handler guarantees), falling back to a generic
 *   status-code message only if the body is missing or malformed.
 */
export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? `Request failed (status ${response.status}).`);
  }

  return (await response.json()) as T;
}
