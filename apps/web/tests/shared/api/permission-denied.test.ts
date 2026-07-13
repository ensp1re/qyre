import type { PermissionDeniedResponse } from "@qyre/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiResponseError,
  PermissionDeniedApiError,
  subscribePermissionDenied
} from "../../../src/shared/api/permission-denied.js";

const DENIAL: PermissionDeniedResponse = {
  error: "Permission denied while attempting to insert on public.users.",
  code: "permission-denied",
  operation: "insert",
  object: "public.users",
  likelyMissingGrant: "INSERT"
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("permission-denied API errors", () => {
  it("notifies subscribers and preserves the structured response on the thrown error", () => {
    const listener = vi.fn();
    cleanups.push(subscribePermissionDenied(listener));

    const error = apiResponseError(DENIAL, 403);

    expect(error).toBeInstanceOf(PermissionDeniedApiError);
    expect(error.message).toBe(DENIAL.error);
    expect((error as PermissionDeniedApiError).denial).toEqual(DENIAL);
    expect(listener).toHaveBeenCalledWith(DENIAL);
  });

  it("keeps ordinary API errors unchanged and does not notify subscribers", () => {
    const listener = vi.fn();
    cleanups.push(subscribePermissionDenied(listener));

    expect(apiResponseError({ error: "constraint failed" }, 500).message).toBe("constraint failed");
    expect(listener).not.toHaveBeenCalled();
  });
});
