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
  supportsAccessInspection: true,
  supportsRowMutations: false,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: "connection"
};

/** Derive SQLite write capability from connection and filesystem writability. */
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
    supportsAccessInspection: true,
    supportsRowMutations: true,
    supportsDdl: true,
    supportsIndexManagement: true,
    // SQLite has no separate database-creation concept in Qyre's model - the file itself is "the
    // database", and the UI never exposes ATTACH DATABASE. Always false, and the adapter has no
    // There is no admin namespace: this is an engine-level absence, not a grant check.
    supportsDatabaseManagement: false,
    supportsTransactions: true,
    readOnlyReason: null
  };
}

/** SQLite has no per-table grants; every table shares the session's own writability. */
export function tablePermissionsFromCapabilities(
  capabilities: ConnectionCapabilities
): TablePermissions {
  const writable = capabilities.supportsRowMutations;
  return { select: true, insert: writable, update: writable, delete: writable };
}
