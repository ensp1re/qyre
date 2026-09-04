import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
import { isDeepStrictEqual } from "node:util";
import { EJSON } from "bson";
import type { MongoClient } from "mongodb";
import {
  Binary,
  BSONRegExp,
  Code,
  Decimal128,
  Long,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from "mongodb";
import { normalizeBsonValue, normalizeDocument } from "../runtime/bson-values.js";

function comparableValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(normalizeBsonValue(value))) as unknown;
}

/** Preserve the current field's BSON type while accepting the grid's readable JSON-safe value. */
function coerceChangedValue(current: unknown, incoming: unknown): unknown {
  const incomingRecord =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : undefined;
  if (current instanceof ObjectId && typeof incoming === "string") return new ObjectId(incoming);
  if (current instanceof Date && typeof incoming === "string") return new Date(incoming);
  if (current instanceof Long && (typeof incoming === "string" || typeof incoming === "number")) {
    return Long.fromString(String(incoming));
  }
  if (
    current instanceof Decimal128 &&
    (typeof incoming === "string" || typeof incoming === "number")
  ) {
    return Decimal128.fromString(String(incoming));
  }
  if (current instanceof Binary && typeof incoming === "string") {
    return new Binary(Buffer.from(incoming, "hex"), current.sub_type);
  }
  if (
    (current instanceof BSONRegExp || current instanceof RegExp) &&
    typeof incomingRecord?.pattern === "string" &&
    typeof incomingRecord.options === "string"
  ) {
    return new BSONRegExp(incomingRecord.pattern, incomingRecord.options);
  }
  if (
    current instanceof Timestamp &&
    typeof incomingRecord?.t === "number" &&
    typeof incomingRecord.i === "number"
  ) {
    return Timestamp.fromBits(incomingRecord.i, incomingRecord.t);
  }
  if (current instanceof Code && typeof incomingRecord?.code === "string") {
    const scope = incomingRecord.scope;
    return new Code(
      incomingRecord.code,
      scope && typeof scope === "object" && !Array.isArray(scope)
        ? (coerceChangedValue(current.scope, scope) as Record<string, unknown>)
        : undefined
    );
  }
  if (current instanceof MinKey && incomingRecord?.$minKey === 1) return new MinKey();
  if (current instanceof MaxKey && incomingRecord?.$maxKey === 1) return new MaxKey();
  if (
    typeof current === "number" &&
    (typeof incoming === "string" || typeof incoming === "number")
  ) {
    return Number(incoming);
  }
  if (Array.isArray(current) && Array.isArray(incoming)) {
    return incoming.map((value, index) => coerceChangedValue(current[index], value));
  }
  if (
    current &&
    incoming &&
    typeof current === "object" &&
    typeof incoming === "object" &&
    !Array.isArray(incoming)
  ) {
    const currentRecord = current as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(incoming as Record<string, unknown>).map(([key, value]) => [
        key,
        coerceChangedValue(currentRecord[key], value)
      ])
    );
  }
  return EJSON.deserialize({ value: incoming }, { relaxed: true }).value;
}

/** Deserialize relaxed Extended JSON before inserting a schemaless MongoDB document. */
export async function insertRow(
  client: MongoClient,
  schema: string,
  table: string,
  document: Record<string, unknown>
): Promise<InsertRowResult> {
  const deserialized = EJSON.deserialize(document, { relaxed: true }) as Record<string, unknown>;
  const result = await client.db(schema).collection(table).insertOne(deserialized);
  return { row: normalizeDocument({ ...deserialized, _id: result.insertedId }) };
}

/** Replace a document by `_id`, using EJSON text comparison for optimistic concurrency. */
export async function updateRowByKey(
  client: MongoClient,
  schema: string,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>,
  expectedOriginal?: Record<string, unknown>
): Promise<UpdateRowResult> {
  const id = new ObjectId(key._id as string);
  const collection = client.db(schema).collection(table);

  if (expectedOriginal) {
    const current = await collection.findOne({ _id: id });
    const deserializedExpected = EJSON.deserialize(expectedOriginal, {
      relaxed: true
    }) as Record<string, unknown>;
    const currentText = current ? EJSON.stringify(current, { relaxed: true }) : undefined;
    const expectedText = EJSON.stringify(deserializedExpected, { relaxed: true });
    if (currentText !== expectedText) {
      return { matched: 0 };
    }
  }

  const deserialized = EJSON.deserialize(changes, { relaxed: true }) as Record<string, unknown>;
  const { _id: _omitted, ...replacement } = deserialized;
  const result = await collection.findOneAndReplace({ _id: id }, replacement);
  return { matched: result ? 1 : 0 };
}

/** Apply top-level field changes with optimistic conflict detection. */
export async function updateFieldsByKey(
  client: MongoClient,
  schema: string,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>,
  originalValues: Record<string, unknown>,
  missingOriginalFields: readonly string[]
): Promise<UpdateRowResult> {
  const id = new ObjectId(key._id as string);
  const collection = client.db(schema).collection(table);
  const current = await collection.findOne({ _id: id });
  if (!current) return { matched: 0 };

  const filter: Record<string, unknown> = Object.assign(Object.create(null), { _id: id });
  const missing = new Set(missingOriginalFields);
  const set: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  for (const [field, incoming] of Object.entries(changes)) {
    if (field === "_id") return { matched: 0 };
    if (missing.has(field)) {
      if (Object.prototype.hasOwnProperty.call(current, field)) return { matched: 0 };
      filter[field] = { $exists: false };
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, field)) return { matched: 0 };
      if (!isDeepStrictEqual(comparableValue(current[field]), originalValues[field])) {
        return { matched: 0 };
      }
      filter[field] = current[field];
    }
    set[field] = coerceChangedValue(current[field], incoming);
  }

  const result = await collection.updateOne(filter, { $set: set });
  return { matched: result.matchedCount };
}

/** Fetch one document as relaxed Extended JSON text. */
export async function getDocumentText(
  client: MongoClient,
  schema: string,
  table: string,
  id: string
): Promise<string | undefined> {
  const document = await client
    .db(schema)
    .collection(table)
    .findOne({ _id: new ObjectId(id) });
  if (!document) return undefined;
  return EJSON.stringify(document, { relaxed: true });
}

/** Delete the explicitly requested documents by `_id`. */
export async function deleteRowsByKey(
  client: MongoClient,
  schema: string,
  table: string,
  keys: Array<Record<string, unknown>>
): Promise<DeleteRowsResult> {
  const ids = keys.map((key) => new ObjectId(key._id as string));
  const result = await client
    .db(schema)
    .collection(table)
    .deleteMany({ _id: { $in: ids } });
  return { deleted: result.deletedCount };
}
