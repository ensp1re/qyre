/** Operations whose authoritative database denial is normalized by the server (F120). */
export type PermissionDeniedOperation =
  | "insert"
  | "update"
  | "delete"
  | "batch-commit"
  | "csv-import"
  | "execute-query"
  | "create-table"
  | "rename-table"
  | "truncate-table"
  | "drop-table"
  | "add-column"
  | "rename-column"
  | "alter-column"
  | "drop-column"
  | "create-index"
  | "drop-index"
  | "create-database"
  | "drop-database"
  | "list-databases"
  | "list-schemas"
  | "read-table"
  | "create-schema"
  | "drop-schema";

/** Stable 403 body shared by the server and browser when the database rejects a write. */
export interface PermissionDeniedResponse {
  readonly error: string;
  readonly code: "permission-denied";
  readonly operation: PermissionDeniedOperation;
  readonly object: string;
  readonly likelyMissingGrant: string;
}
