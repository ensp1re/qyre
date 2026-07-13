import type { PermissionDenialKind } from "@qyre/driver-contract";

interface MongoErrorShape {
  readonly code?: unknown;
  readonly codeName?: unknown;
  readonly name?: unknown;
  readonly message?: unknown;
}

/** MongoDB code 13/codeName Unauthorized is the stable authorization rejection. The guarded
 * message fallback covers hosted deployments that wrap code 13 in MongoServerError. */
export function classifyMongodbPermissionDenied(error: unknown): PermissionDenialKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const detail = error as MongoErrorShape;
  if (detail.code === 13 || detail.codeName === "Unauthorized") return "permission";
  if (
    detail.name === "MongoServerError" &&
    typeof detail.message === "string" &&
    /not authorized|unauthorized/i.test(detail.message)
  ) {
    return "permission";
  }
  return undefined;
}
