import type { MutationOp } from "@qyre/core";
import type { PendingEdits, PendingInserts } from "./pending-changes.js";

export function parseRowKey(rowKey: string): Record<string, unknown> {
  return Object.fromEntries(JSON.parse(rowKey) as [string, unknown][]);
}

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
    const originalValues: Record<string, unknown> = {};
    const missingOriginalFields: string[] = [];
    for (const [column, staged] of rowEdits) {
      changes[column] = staged.next;
      if (staged.original === undefined) missingOriginalFields.push(column);
      else originalValues[column] = staged.original;
    }
    ops.push({
      type: "update",
      schema,
      table,
      key: parseRowKey(rowKey),
      changes,
      originalValues,
      missingOriginalFields
    });
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

export function buildPreviewLine(op: MutationOp, engine?: "mongodb"): string {
  if (engine === "mongodb") {
    if (op.type === "insert") return JSON.stringify({ insertOne: { document: op.values } });
    if (op.type === "update") {
      return JSON.stringify({ updateOne: { filter: op.key, update: { $set: op.changes } } });
    }
    return JSON.stringify({ deleteMany: { keys: op.keys } });
  }
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
