import type { PermissionDenialKind } from "@qyre/driver-contract";

interface PostgresErrorShape {
  readonly code?: unknown;
  readonly message?: unknown;
}

/** PostgreSQL SQLSTATE classifier. 42501 covers insufficient privilege and owner-only DDL;
 * 25006 is a write attempted in a read-only transaction/session. */
export function classifyPostgresPermissionDenied(error: unknown): PermissionDenialKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const detail = error as PostgresErrorShape;
  if (detail.code === "25006") return "read-only";
  if (detail.code !== "42501") return undefined;
  return typeof detail.message === "string" && /must be owner|must own/i.test(detail.message)
    ? "ownership"
    : "permission";
}
