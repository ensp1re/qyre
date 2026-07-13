import { accessSync, constants } from "node:fs";
import { dirname } from "node:path";
import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";
import type Database from "better-sqlite3";

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const READ_ONLY_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: true,
  rowExportFormats: ["csv", "json", "sql"],
  jsonExportMode: "json",
  supportsRowMutations: false,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: "connection"
};

/**
 * SQLite has no users/grants - writability is one session-wide fact, gated on the signals
 * docs/product-specs/permissions-and-capabilities.md names for this engine: the database file AND
 * its containing directory must both be OS-writable (WAL/rollback-journal sidecar files need
 * directory write even when the file itself is writable - a writable file in a read-only directory
 * still refuses every write, verified live against a real chmod'd fixture), `PRAGMA query_only`
 * must be off, and the connection itself must not have been opened read-only (`adapter.ts`'s
 * `connect()` falls back to an explicit read-only open when a normal open fails outright - `db
 * .readonly` reflects that live). `db.readonly` alone would miss a read-only *directory* with a
 * writable file (confirmed live: SQLite only discovers that on the first write, not at open time),
 * which is why the explicit fs checks below stay even though they overlap with what `db.readonly`
 * already covers for a read-only *file*.
 */
export function computeCapabilities(
  resolvedPath: string,
  db: Database.Database
): ConnectionCapabilities {
  const canWrite =
    !db.readonly &&
    db.pragma("query_only", { simple: true }) !== 1 &&
    isWritable(resolvedPath) &&
    isWritable(dirname(resolvedPath));

  if (!canWrite) return READ_ONLY_CAPABILITIES;

  return {
    supportsSql: true,
    rowExportFormats: ["csv", "json", "sql"],
    jsonExportMode: "json",
    supportsRowMutations: true,
    supportsDdl: true,
    supportsIndexManagement: true,
    // SQLite has no separate database-creation concept in Qyre's model - the file itself is "the
    // database", and the UI never exposes ATTACH DATABASE. Always false, and the adapter has no
    // F115 admin namespace at all: an engine-level absence, not a grant check.
    supportsDatabaseManagement: false,
    supportsTransactions: true,
    readOnlyReason: null
  };
}

/** SQLite has no per-table grants - every table shares the session's own writability (F094). */
export function tablePermissionsFromCapabilities(
  capabilities: ConnectionCapabilities
): TablePermissions {
  const writable = capabilities.supportsRowMutations;
  return { select: true, insert: writable, update: writable, delete: writable };
}
