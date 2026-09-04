import { getAuthToken } from "./auth-token.js";
import { apiResponseError } from "./permission-denied.js";

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw apiResponseError(body, response.status);
  }

  if (response.status === 204) return null as T;

  return (await response.json()) as T;
}
