import { getAuthToken } from "./auth-token.js";
import { apiResponseError } from "./permission-denied.js";

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
