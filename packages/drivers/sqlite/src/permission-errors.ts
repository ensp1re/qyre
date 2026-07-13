import type { PermissionDenialKind } from "@qyre/driver-contract";

/** better-sqlite3 exposes SQLite's stable result code on `error.code`. */
export function classifySqlitePermissionDenied(error: unknown): PermissionDenialKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { readonly code?: unknown }).code;
  if (typeof code !== "string") return undefined;
  if (code.startsWith("SQLITE_READONLY")) return "read-only";
  if (code === "SQLITE_PERM" || code === "SQLITE_AUTH") return "permission";
  return undefined;
}
