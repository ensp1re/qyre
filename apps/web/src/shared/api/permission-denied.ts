import type { PermissionDeniedResponse } from "@qyre/core";

type PermissionDeniedListener = (denial: PermissionDeniedResponse) => void;

const listeners = new Set<PermissionDeniedListener>();

export class PermissionDeniedApiError extends Error {
  constructor(readonly denial: PermissionDeniedResponse) {
    super(denial.error);
    this.name = "PermissionDeniedApiError";
  }
}

function isPermissionDeniedResponse(value: unknown): value is PermissionDeniedResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<PermissionDeniedResponse>;
  return (
    body.code === "permission-denied" &&
    typeof body.error === "string" &&
    typeof body.operation === "string" &&
    typeof body.object === "string" &&
    typeof body.likelyMissingGrant === "string"
  );
}

export function apiResponseError(body: unknown, status: number): Error {
  if (isPermissionDeniedResponse(body)) {
    for (const listener of listeners) listener(body);
    return new PermissionDeniedApiError(body);
  }
  const message =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `Request failed (status ${status}).`;
  return new Error(message);
}

export function subscribePermissionDenied(listener: PermissionDeniedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
