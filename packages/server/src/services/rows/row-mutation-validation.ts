import type { ColumnMetadata, DatabaseEngine, MutationOp, TableMetadata } from "@qyre/core";
import { classifyFilterColumnKind, type FilterColumnKind } from "@qyre/core/filter-capabilities";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { isExactNumericText, validateMutationValue } from "@qyre/core/mutation-editor-values";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { Buffer } from "node:buffer";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** Before MongoDB ObjectIds were normalized at the adapter boundary, an ObjectId created by a
 * second BSON package instance could cross the wire as `{ buffer: { "0": 80, ... } }`. Accept
 * only that exact 12-byte legacy shape so a row already loaded in the browser remains committable
 * after the server is upgraded; new row responses always use hexadecimal text. */
function legacyObjectIdText(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !("buffer" in record)) return undefined;
  const buffer = record.buffer;
  if (!buffer || typeof buffer !== "object" || Array.isArray(buffer)) return undefined;
  const byteRecord = buffer as Record<string, unknown>;
  const keys = Object.keys(byteRecord);
  if (keys.length !== 12 || keys.some((key, index) => key !== String(index))) return undefined;
  const bytes = keys.map((key) => byteRecord[key]);
  if (
    bytes.some((byte) => !Number.isInteger(byte) || (byte as number) < 0 || (byte as number) > 255)
  ) {
    return undefined;
  }
  return Buffer.from(bytes as number[]).toString("hex");
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

/** MongoDB row keys still use the filter classifier because `_id` is sampled metadata and may
 * require ObjectId validation. SQL mutation values use the richer typed-editor contract below. */
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
      if (typeof value !== "number" && !(typeof value === "string" && isExactNumericText(value))) {
        throw badRequest(`Column "${columnName}" expects an exact number.`);
      }
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
    case "objectId": {
      const objectId =
        typeof value === "string"
          ? value
          : value &&
              typeof value === "object" &&
              "$oid" in value &&
              typeof (value as { $oid?: unknown }).$oid === "string"
            ? (value as { $oid: string }).$oid
            : legacyObjectIdText(value);
      if (!objectId || !/^[0-9a-f]{24}$/i.test(objectId)) {
        throw badRequest(`Column "${columnName}" expects a 24-character hex ObjectId string.`);
      }
      return objectId.toLowerCase();
    }
    case "null":
    case "structured":
    case "binary":
    case "unknown":
      throw badRequest(`Column "${columnName}" (${kind}) is not editable.`);
  }
}

function resolveEditableValue(
  column: ColumnMetadata,
  value: unknown,
  engine: DatabaseAdapter["engine"]
): unknown {
  if (value === null) {
    if (!column.nullable) throw badRequest(`Column "${column.name}" is not nullable.`);
    return null;
  }

  const metadata = {
    allowedValues: column.allowedValues,
    elementDataType: column.elementDataType
  };
  const databaseEngine = engine as DatabaseEngine;
  const capability = mutationEditorCapability(column.dataType, databaseEngine, metadata);
  if (!capability.editable) {
    throw badRequest(
      `Column "${column.name}" is not editable. ${capability.unavailableReason ?? ""}`.trim()
    );
  }
  const result = validateMutationValue(capability, value, databaseEngine, metadata);
  if (!result.valid) throw badRequest(`Column "${column.name}": ${result.error}`);

  if (capability.widget === "json") return JSON.stringify(result.value);
  if (capability.widget === "set") return (result.value as string[]).join(",");
  if (capability.widget === "binary") return Buffer.from(result.value as string, "hex");
  return result.value;
}

function mongoInsertNumber(value: unknown, columnName: string): unknown {
  const text = String(value);
  if (/^[+-]?\d+$/.test(text)) {
    const integer = BigInt(text);
    if (integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(integer);
    }
    if (integer >= -(BigInt(2) ** BigInt(63)) && integer < BigInt(2) ** BigInt(63)) {
      return { $numberLong: text };
    }
  }
  const number = Number(text);
  if (!Number.isFinite(number)) throw badRequest(`Column "${columnName}" expects a finite number.`);
  return number;
}

/** Validates one sampled MongoDB grid value and converts insert-only BSON types to EJSON. Updates
 * remain in the grid's readable JSON-safe shape; the driver preserves the current field's BSON
 * type when applying them. */
function resolveMongoGridValue(
  column: ColumnMetadata,
  value: unknown,
  mode: "insert" | "update"
): unknown {
  if (value === null) {
    if (!column.nullable) throw badRequest(`Column "${column.name}" is not nullable.`);
    return null;
  }
  const capability = mutationEditorCapability(column.dataType, "mongodb", column);
  if (!capability.editable) {
    throw badRequest(
      `Column "${column.name}" is not editable. ${capability.unavailableReason ?? ""}`.trim()
    );
  }
  const result = validateMutationValue(capability, value, "mongodb", column);
  if (!result.valid) throw badRequest(`Column "${column.name}": ${result.error}`);
  if (mode === "update") return result.value;

  if (capability.kind === "object-id") return { $oid: result.value };
  if (capability.kind === "timestamp-time-zone") {
    return { $date: new Date(result.value as string).toISOString() };
  }
  if (capability.kind === "numeric") return mongoInsertNumber(result.value, column.name);
  if (capability.kind === "binary") {
    return {
      $binary: {
        base64: Buffer.from(result.value as string, "hex").toString("base64"),
        subType: "00"
      }
    };
  }
  if (capability.kind === "bson-regex") {
    const regex = result.value as { pattern: string; options: string };
    return { $regularExpression: regex };
  }
  if (capability.kind === "bson-timestamp") {
    return { $timestamp: result.value };
  }
  if (capability.kind === "bson-code") {
    const code = result.value as { code: string; scope?: Record<string, unknown> };
    return code.scope === undefined
      ? { $code: code.code }
      : { $code: code.code, $scope: code.scope };
  }
  return result.value;
}

function resolveMongoGridValues(
  tableMetadata: TableMetadata,
  body: Record<string, unknown>,
  mode: "insert" | "update"
): Record<string, unknown> {
  if (mode === "update" && Object.keys(body).length === 0) {
    throw badRequest("changes must include at least one field.");
  }
  return Object.fromEntries(
    Object.entries(body).map(([field, value]) => {
      if (
        field.includes(".") ||
        field.startsWith("$") ||
        ["__proto__", "constructor", "prototype"].includes(field)
      ) {
        throw badRequest(`MongoDB field "${field}" cannot be safely edited in the grid.`);
      }
      const column = tableMetadata.columns.find((candidate) => candidate.name === field);
      if (!column) throw badRequest(`Unknown sampled field "${field}".`);
      if (mode === "update" && column.isPrimaryKey) {
        throw badRequest(`Field "${field}" is the document key and cannot be changed.`);
      }
      return [field, resolveMongoGridValue(column, value, mode)];
    })
  );
}

/**
 * Validates/coerces a column -> value map against the table's real introspected columns before an
 * adapter is ever called - the actual injection surface, since a column name is a raw identifier a
 * driver can't parameter-bind (same reasoning as `resolveRowSort`/filter-column validation).
 * `rejectPrimaryKey` is set for update's `changes` map only (F100): a primary-key column is always
 * suppliable on insert, but per docs/product-specs/row-editing.md is "never editable when updating
 * an existing row" - changing a row's identity mid-edit isn't a supported operation here.
 */
function resolveColumnValues(
  tableMetadata: TableMetadata,
  body: Record<string, unknown>,
  engine: DatabaseAdapter["engine"],
  rejectPrimaryKey: boolean
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [columnName, rawValue] of Object.entries(body)) {
    const column = tableMetadata.columns.find((candidate) => candidate.name === columnName);
    if (!column) throw badRequest(`Unknown column "${columnName}".`);
    if (rejectPrimaryKey && column.isPrimaryKey) {
      throw badRequest(`Column "${columnName}" is part of the primary key and cannot be changed.`);
    }
    resolved[columnName] = resolveEditableValue(column, rawValue, engine);
  }
  return resolved;
}

/**
 * Validates/coerces an insert request body against the table's real introspected columns.
 * MongoDB is deliberately exempt: its columns are sampled/best-effort, not an authoritative
 * catalog, and its document is EJSON-deserialized inside the adapter itself instead - Qyre doesn't
 * invent document-shape constraints it doesn't enforce, per the spec.
 */
export function resolveInsertValues(
  tableMetadata: TableMetadata,
  body: Record<string, unknown>,
  engine: DatabaseAdapter["engine"]
): Record<string, unknown> {
  if (engine === "mongodb") return body;
  return resolveColumnValues(tableMetadata, body, engine, false);
}

/**
 * Validates/coerces an update request's `changes` map (F100): primary-key columns are rejected
 * (never editable via update, per docs/product-specs/row-editing.md), and an empty map is rejected
 * too - there is nothing to update. MongoDB is exempt for the same reason `resolveInsertValues` is:
 * its whole-document replacement is EJSON-deserialized inside the adapter, not validated per field.
 */
export function resolveUpdateChanges(
  tableMetadata: TableMetadata,
  body: Record<string, unknown>,
  engine: DatabaseAdapter["engine"]
): Record<string, unknown> {
  if (engine === "mongodb") return body;
  if (Object.keys(body).length === 0) {
    throw badRequest("changes must include at least one column.");
  }
  return resolveColumnValues(tableMetadata, body, engine, true);
}

/**
 * Validates/coerces an update/delete request's row-identity `key`, per docs/product-specs/
 * row-editing.md: the full primary key must be supplied as a set (a composite key is matched
 * exactly, never a subset), and a table with no primary key at all is rejected outright - there is
 * no reliable way to target one specific row without one. MongoDB's key is always exactly `{_id}`,
 * matching its single-field primary key (F068).
 */
export function resolveKey(
  tableMetadata: TableMetadata,
  key: Record<string, unknown>,
  engine: DatabaseAdapter["engine"]
): Record<string, unknown> {
  const primaryKeyColumns = tableMetadata.columns.filter((column) => column.isPrimaryKey);
  if (primaryKeyColumns.length === 0) {
    throw badRequest("This table has no primary key; a specific row cannot be targeted.");
  }

  const primaryKeyNames = new Set(primaryKeyColumns.map((column) => column.name));
  for (const providedName of Object.keys(key)) {
    if (!primaryKeyNames.has(providedName)) {
      throw badRequest(`"${providedName}" is not part of the primary key.`);
    }
  }

  const resolved: Record<string, unknown> = {};
  for (const column of primaryKeyColumns) {
    if (!(column.name in key)) {
      throw badRequest(`Primary key column "${column.name}" is required.`);
    }
    if (key[column.name] === null) {
      throw badRequest("Rows with a NULL primary key cannot be targeted.");
    }
    if (engine === "mongodb") {
      const kind = classifyFilterColumnKind(column.dataType, engine);
      resolved[column.name] = coerceRowValue(kind, key[column.name], column.nullable, column.name);
    } else {
      resolved[column.name] = resolveEditableValue(column, key[column.name], engine);
    }
  }
  return resolved;
}

/**
 * Validates/coerces a delete request's `keys` list (F101) by running each entry through
 * `resolveKey` - an empty list is rejected outright, matching "keys" being the request's sole
 * required content (nothing to delete otherwise). No filter-based bulk delete: every key must be an
 * explicit, already-loaded primary-key match, per docs/product-specs/row-editing.md.
 */
export function resolveKeys(
  tableMetadata: TableMetadata,
  keys: Array<Record<string, unknown>>,
  engine: DatabaseAdapter["engine"]
): Array<Record<string, unknown>> {
  if (keys.length === 0) {
    throw badRequest("keys must include at least one entry.");
  }
  return keys.map((key) => resolveKey(tableMetadata, key, engine));
}

/** Validates/coerces one op against its table's already-fetched metadata - the synchronous half
 * `resolveBatchOps` delegates to once it has each op's `tableMetadata` in hand. */
function resolveOneOp(
  tableMetadata: TableMetadata,
  op: MutationOp,
  engine: DatabaseAdapter["engine"]
): MutationOp {
  assertMutable(tableMetadata, op.type);
  if (op.type === "insert") {
    return {
      ...op,
      values:
        engine === "mongodb"
          ? resolveMongoGridValues(tableMetadata, op.values, "insert")
          : resolveInsertValues(tableMetadata, op.values, engine)
    };
  }
  if (op.type === "update") {
    if (engine === "mongodb") {
      const missing = new Set(op.missingOriginalFields ?? []);
      if (!op.originalValues) throw badRequest("MongoDB updates require originalValues.");
      for (const field of Object.keys(op.changes)) {
        const hasOriginal = Object.prototype.hasOwnProperty.call(op.originalValues, field);
        if (hasOriginal === missing.has(field)) {
          throw badRequest(`MongoDB update field "${field}" must have one original-state guard.`);
        }
      }
      return {
        ...op,
        key: resolveKey(tableMetadata, op.key, engine),
        changes: resolveMongoGridValues(tableMetadata, op.changes, "update")
      };
    }
    return {
      ...op,
      key: resolveKey(tableMetadata, op.key, engine),
      changes: resolveUpdateChanges(tableMetadata, op.changes, engine)
    };
  }
  return { ...op, keys: resolveKeys(tableMetadata, op.keys, engine) };
}

function batchTargetKey(op: Pick<MutationOp, "schema" | "table">): string {
  return `${op.schema} ${op.table}`;
}

/**
 * Validates/coerces every op in a `POST /api/mutations/commit` batch (F135 review finding V2) -
 * `assertMutable` plus the matching `resolve*` helper for each op, same as the per-op routes' own
 * validation, but sharing one introspection per distinct `schema.table` across the whole batch
 * instead of firing `getTable` once per op. A staged batch is almost always many ops against one
 * table (200 staged cell edits previously fired 200 concurrent, identical introspection query
 * sets before the transaction even started). Ops keep their original relative order in the
 * returned array - `result.failedIndex` and the route's own `ops[]` lookups both depend on it -
 * and a validation failure on any op still throws before `commitBatch` is ever called, per
 * docs/product-specs/row-editing.md's "validation failure on any operation aborts the whole
 * commit before any write happens." The failure actually reported is deterministic (the first
 * array-order op with a problem), a side effect of sharing one metadata-fetch phase ahead of a
 * synchronous validation pass instead of racing N independent async validations.
 */
export async function resolveBatchOps(
  db: DatabaseAdapter,
  ops: MutationOp[]
): Promise<MutationOp[]> {
  const targets = new Map<string, { schema: string; table: string }>();
  for (const op of ops) {
    const key = batchTargetKey(op);
    if (!targets.has(key)) targets.set(key, { schema: op.schema, table: op.table });
  }

  const metadataEntries = await Promise.all(
    [...targets].map(
      async ([key, target]) => [key, await db.getTable(target.schema, target.table)] as const
    )
  );
  const metadataByKey = new Map(metadataEntries);

  return ops.map((op) => resolveOneOp(metadataByKey.get(batchTargetKey(op))!, op, db.engine));
}
