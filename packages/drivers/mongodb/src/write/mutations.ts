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

/**
 * `document` is the raw request body Fastify already JSON-parsed - `$oid`/`$date`/`$numberLong`/
 * `$binary` wrapper objects (relaxed Extended JSON, per docs/product-specs/row-editing.md) arrive
 * as plain nested JS objects at this point, so `EJSON.deserialize` (not `EJSON.parse`, which
 * expects a raw text string) converts them into real BSON types (`ObjectId`, `Date`, ...) before
 * `insertOne`. Unlike the SQL engines, this document is not validated against `getTable`'s
 * sampled/best-effort column list - MongoDB is schemaless, and Qyre doesn't invent document-shape
 * constraints it doesn't enforce.
 */
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

/**
 * Whole-document replace keyed on `_id` (the "Compass model", not a changed-fields `$set`), per
 * docs/product-specs/row-editing.md. `key._id` is already validated as a syntactically valid 24-hex
 * ObjectId string by the caller; `changes` is the full replacement document as relaxed EJSON,
 * deserialized the same way `insertRow` does. `_id` itself is stripped from the replacement body
 * (immutable on a document replace - matches SQL's "a primary-key column is never editable when
 * updating an existing row" rule) even if present in the submitted text. `matched` is 0 when no
 * document with that `_id` exists (the caller reports this as the same "stale row" conflict SQL's
 * 0-rowcount update gets), 1 when a document was found and replaced.
 *
 * `expectedOriginal` (the whole-document compatibility route) is the document as it was loaded before
 * editing - when present, the current document is re-fetched and structurally compared against it
 * first, by re-serializing both to relaxed EJSON text and comparing the strings. Deliberately not a
 * plain-object deep-equal (`node:util`'s `isDeepStrictEqual`): `mongodb` (CommonJS) and this
 * package's own `bson` import (ESM) resolve to two separate compiled copies of the `bson` library -
 * a real "dual package hazard," not just a build quirk - so a document the driver returns and one
 * this file deserializes never share the same `ObjectId`/`Date` *class*, even for byte-identical
 * values, and a strict class-aware deep-equal would report every save as a false conflict. `EJSON`
 * itself avoids this by tagging BSON values with a `_bsontype` string instead of checking
 * `instanceof`, so stringifying both sides through the same `EJSON.stringify` call sidesteps the
 * hazard entirely. A mismatch means the document changed since it was loaded, reported as the same
 * `matched: 0` conflict a stale key gets - never overwritten silently.
 */
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

/**
 * Applies the shared grid's top-level field changes without replacing the rest of the document.
 * Every edited field is compared with the value the user originally saw, then included in the
 * update filter with its current BSON value so a race between the read and update is also rejected.
 */
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

/**
 * Fetches one document by `_id` as relaxed Extended JSON text for compatibility clients.
 * `undefined` when no document with that id exists.
 */
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

/**
 * Deletes by an explicit `_id` list, per docs/product-specs/row-editing.md - no filter-based bulk
 * delete. Each `key._id` is already validated as a syntactically valid 24-hex ObjectId string by
 * the caller. One `deleteMany({ _id: { $in: [...] } })` call: `deletedCount` may be less than the
 * requested key count if some ids no longer match (already deleted/never existed) - reported as-is,
 * the same "stale" treatment SQL's per-key delete count gets.
 */
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
