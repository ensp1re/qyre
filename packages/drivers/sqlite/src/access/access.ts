import { accessSync, constants, statSync } from "node:fs";
import { dirname } from "node:path";
import type { AccessOverview } from "@qyre/core";
import type Database from "better-sqlite3";

function writable(path: string): string {
  try {
    accessSync(path, constants.W_OK);
    return "Yes";
  } catch {
    return "No";
  }
}

export async function inspectAccess(
  resolvedPath: string,
  db: Database.Database
): Promise<AccessOverview> {
  const mode = statSync(resolvedPath).mode & 0o777;
  const queryOnly = db.pragma("query_only", { simple: true }) === 1;
  return {
    identity: "Local filesystem process",
    roles: [],
    grants: [],
    facts: [
      { label: "Database file", value: resolvedPath },
      { label: "File mode", value: `0${mode.toString(8)}` },
      { label: "File writable", value: writable(resolvedPath) },
      { label: "Parent directory writable", value: writable(dirname(resolvedPath)) },
      { label: "Connection read-only", value: db.readonly ? "Yes" : "No" },
      { label: "PRAGMA query_only", value: queryOnly ? "On" : "Off" }
    ],
    notices: [
      "SQLite has no database roles or grants; access is controlled by filesystem permissions."
    ]
  };
}
