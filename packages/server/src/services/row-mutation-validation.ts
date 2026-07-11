import type { TableMetadata } from "@qyre/core";
import { classifyFilterColumnKind, type FilterColumnKind } from "@qyre/core/filter-capabilities";
import type { DatabaseAdapter } from "@qyre/driver-contract";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Rejects a mutation against a table that can't accept one, per docs/product-specs/row-editing.md:
 * `kind !== "table"`/`"collection"` (F124 - a view has no rows of its own to update) is a 400
 * (the target itself is invalid); missing `TablePermissions` or the specific action's flag being
 * `false` is a 403 (a real target, just not permitted) - undefined `permissions` fails closed
 * (never assumed-writable), matching the advisory-introspection principle.
 */
export function assertMutable(
  tableMetadata: TableMetadata,
  action: "insert" | "update" | "delete"
): void {
  if (tableMetadata.kind !== "table" && tableMetadata.kind !== "collection") {
    throw badRequest(`Cannot ${action} into a ${tableMetadata.kind}.`);
  }
  if (!tableMetadata.permissions?.[action]) {
    throw Object.assign(new Error(`This table does not permit ${action}.`), { statusCode: 403 });
  }
}

/**
 * Coerces one value against its column's `FilterColumnKind` (reused from F082/F089, not
 * reimplemented - docs/product-specs/row-editing.md), matching the exact rules the spec fixes:
 * JSON-typed values only (a `numeric` column rejects a numeric *string*, unlike `RowFilter.value`,
 * which is always a URL query string), date/time/datetime pass through as the validated ISO string
 * (the driver owns the actual conversion), and structured/binary/unknown/null-kind columns are
 * never accepted here.
 */
function coerceRowValue(
  kind: FilterColumnKind,
  value: unknown,
  nullable: boolean,
  columnName: string
): unknown {
  if (value === null) {
    if (!nullable) throw badRequest(`Column "${columnName}" is not nullable.`);
    return null;
  }
  switch (kind) {
    case "text":
    case "identifier":
      if (typeof value !== "string") throw badRequest(`Column "${columnName}" expects a string.`);
      return value;
    case "numeric":
      if (typeof value !== "number") throw badRequest(`Column "${columnName}" expects a number.`);
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw badRequest(`Column "${columnName}" expects a boolean.`);
      return value;
    case "date":
    case "time":
    case "datetime":
      if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
        throw badRequest(`Column "${columnName}" expects an ISO-8601 date/time string.`);
      }
      return value;
    case "objectId":
      if (typeof value !== "string" || !/^[0-9a-f]{24}$/i.test(value)) {
        throw badRequest(`Column "${columnName}" expects a 24-character hex ObjectId string.`);
      }
      return value;
    case "null":
    case "structured":
    case "binary":
    case "unknown":
      throw badRequest(`Column "${columnName}" (${kind}) is not editable.`);
  }
}

/**
 * Validates/coerces an insert request body against the table's real introspected columns before
 * an adapter is ever called - the actual injection surface, since a column name is a raw
 * identifier a driver can't parameter-bind (same reasoning as `resolveRowSort`/filter-column
 * validation). MongoDB is deliberately exempt: its columns are sampled/best-effort, not an
 * authoritative catalog, and its document is EJSON-deserialized inside the adapter itself instead -
 * Qyre doesn't invent document-shape constraints it doesn't enforce, per the spec.
 */
export function resolveInsertValues(
  tableMetadata: TableMetadata,
  body: Record<string, unknown>,
  engine: DatabaseAdapter["engine"]
): Record<string, unknown> {
  if (engine === "mongodb") return body;

  const resolved: Record<string, unknown> = {};
  for (const [columnName, rawValue] of Object.entries(body)) {
    const column = tableMetadata.columns.find((candidate) => candidate.name === columnName);
    if (!column) throw badRequest(`Unknown column "${columnName}".`);
    const kind = classifyFilterColumnKind(column.dataType, engine);
    resolved[columnName] = coerceRowValue(kind, rawValue, column.nullable, columnName);
  }
  return resolved;
}
