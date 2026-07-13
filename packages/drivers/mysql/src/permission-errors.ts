import type { PermissionDenialKind } from "@qyre/driver-contract";

interface MysqlErrorShape {
  readonly code?: unknown;
  readonly errno?: unknown;
}

const PERMISSION_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_COLUMNACCESS_DENIED_ERROR",
  "ER_SPECIFIC_ACCESS_DENIED_ERROR",
  "ER_PROCACCESS_DENIED_ERROR"
]);
const PERMISSION_ERRNOS = new Set([1044, 1045, 1142, 1143, 1227, 1370]);

/** MySQL classifier based on stable symbolic/numeric driver codes, never message text. */
export function classifyMysqlPermissionDenied(error: unknown): PermissionDenialKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const detail = error as MysqlErrorShape;
  if (detail.code === "ER_OPTION_PREVENTS_STATEMENT" || detail.errno === 1290) return "read-only";
  if (
    (typeof detail.code === "string" && PERMISSION_CODES.has(detail.code)) ||
    (typeof detail.errno === "number" && PERMISSION_ERRNOS.has(detail.errno))
  ) {
    return "permission";
  }
  return undefined;
}
