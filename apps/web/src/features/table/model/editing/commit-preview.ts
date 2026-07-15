import type { MutationOp } from "@qyre/core";
import type { PendingEdits, PendingInserts } from "./pending-changes.js";

/** Reconstructs the primary-key value map a row key was derived from - `computeRowKey` is
 * `JSON.stringify` of a sorted `[column, value][]` array, so parsing it back and rebuilding an
 * object is exact and needs no extra state alongside the buffer. */
export function parseRowKey(rowKey: string): Record<string, unknown> {
  return Object.fromEntries(JSON.parse(rowKey) as [string, unknown][]);
}

/**
 * Builds the ordered `MutationOp[]` a batch commit (F102's `POST /api/mutations/commit`) expects
 * from the buffer's current staged state - inserts, then updates, then one delete op batching every
 * staged key, matching `MutationOp`'s delete shape (`keys: Array<...>`, not one op per row).
 */
export function buildMutationOps(
  schema: string,
  table: string,
  edits: PendingEdits,
  inserts: PendingInserts,
  deletes: ReadonlySet<string>
): MutationOp[] {
  const ops: MutationOp[] = [];

  for (const insert of inserts) {
    ops.push({ type: "insert", schema, table, values: { ...insert.values } });
  }

  for (const [rowKey, rowEdits] of edits) {
    const changes: Record<string, unknown> = {};
    for (const [column, staged] of rowEdits) changes[column] = staged.next;
    ops.push({ type: "update", schema, table, key: parseRowKey(rowKey), changes });
  }

  if (deletes.size > 0) {
    ops.push({ type: "delete", schema, table, keys: [...deletes].map(parseRowKey) });
  }

  return ops;
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatWhereClause(key: Record<string, unknown>): string {
  return Object.entries(key)
    .map(([column, value]) => `${column} = ${formatSqlValue(value)}`)
    .join(" AND ");
}

/**
 * A human-readable preview of the statement one staged operation will run on commit - parameter
 * values shown inline for readability, per docs/product-specs/row-editing.md ("parameter
 * placeholders shown with their bound values inline... this is a preview, not the real query text
 * sent to the driver"). Never sent anywhere; display-only.
 */
export function buildPreviewLine(op: MutationOp): string {
  const target = `"${op.schema}"."${op.table}"`;

  if (op.type === "insert") {
    const columns = Object.keys(op.values);
    if (columns.length === 0) return `INSERT INTO ${target} DEFAULT VALUES`;
    const values = columns.map((column) => formatSqlValue(op.values[column]));
    return `INSERT INTO ${target} (${columns.join(", ")}) VALUES (${values.join(", ")})`;
  }

  if (op.type === "update") {
    const setClause = Object.entries(op.changes)
      .map(([column, value]) => `${column} = ${formatSqlValue(value)}`)
      .join(", ");
    return `UPDATE ${target} SET ${setClause} WHERE ${formatWhereClause(op.key)}`;
  }

  const whereClause = op.keys.map((key) => `(${formatWhereClause(key)})`).join(" OR ");
  return `DELETE FROM ${target} WHERE ${whereClause}`;
}
