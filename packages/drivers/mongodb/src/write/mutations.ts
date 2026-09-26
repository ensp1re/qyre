import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
import { isExactNumericText, parseTimestampInstant } from "@qyre/core/mutation-editor-values";
import { isDeepStrictEqual } from "node:util";
import type { MongoClient } from "mongodb";
import {
  Binary,
  BSONRegExp,
  Code,
  Decimal128,
  Double,
  Int32,
  Long,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from "mongodb";
import { int64FromText } from "../runtime/bson-numbers.js";
import { normalizeBsonValue, normalizeDocument } from "../runtime/bson-values.js";
import { documentText, EXACT_DOCUMENT_READ, parseDocumentJson } from "./document-text.js";

type DocumentKey = ObjectId | Long | Decimal128 | string | number;

interface StoredDocument {
  _id: DocumentKey;
  [field: string]: unknown;
}

const OBJECT_ID_TEXT = /^[0-9a-f]{24}$/i;
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;
/** Signals that an incoming value does not fit the current BSON type. */
const MISMATCH = Symbol("mismatch");

function invalidValue(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function comparableValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(normalizeBsonValue(value))) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolve the server's typed key form: `{ $oid }`, `{ $numberLong }`, `{ $numberDecimal }`, or a
 * plain string/number.
 */
function documentKey(value: unknown): DocumentKey {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value) && Object.keys(value).length === 1) {
    if (typeof value.$oid === "string" && OBJECT_ID_TEXT.test(value.$oid)) {
      return new ObjectId(value.$oid);
    }
    if (typeof value.$numberLong === "string") {
      const integer = int64FromText(value.$numberLong);
      if (integer !== undefined) return Long.fromBigInt(integer);
    }
    if (typeof value.$numberDecimal === "string") {
      try {
        return Decimal128.fromString(value.$numberDecimal);
      } catch {
        // Falls through to the unsupported-key error.
      }
    }
  }
  throw invalidValue("Unsupported MongoDB document key.");
}

function numericText(incoming: unknown): string | undefined {
  if (typeof incoming === "number") return Number.isFinite(incoming) ? String(incoming) : undefined;
  if (typeof incoming === "string" && isExactNumericText(incoming)) return incoming.trim();
  return undefined;
}

function coerceNumber(current: unknown, incoming: unknown, lenient: boolean): unknown {
  // Nested Int32/Double values display as JSON numbers, so nested text stays text.
  const displaysAsText = current instanceof Long || current instanceof Decimal128;
  if (lenient && typeof incoming === "string" && !displaysAsText) return MISMATCH;
  const text = numericText(incoming);
  if (text === undefined) return MISMATCH;
  const digitsInteger = int64FromText(text);
  if (current instanceof Long) {
    if (typeof incoming === "number") {
      return Number.isSafeInteger(incoming) ? Long.fromNumber(incoming) : MISMATCH;
    }
    return digitsInteger === undefined ? MISMATCH : Long.fromBigInt(digitsInteger);
  }
  if (current instanceof Decimal128) {
    try {
      return Decimal128.fromString(text);
    } catch {
      return MISMATCH;
    }
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return MISMATCH;
  if (current instanceof Int32) {
    const integer = digitsInteger ?? (Number.isSafeInteger(number) ? BigInt(number) : undefined);
    if (integer === undefined) return new Double(number);
    if (integer >= BigInt(INT32_MIN) && integer <= BigInt(INT32_MAX)) {
      return new Int32(Number(integer));
    }
    return Long.fromBigInt(integer);
  }
  if (current instanceof Double) return new Double(number);
  return number;
}

function isNumericBson(value: unknown): boolean {
  return (
    value instanceof Long ||
    value instanceof Decimal128 ||
    value instanceof Int32 ||
    value instanceof Double ||
    typeof value === "number"
  );
}

/** Return a scalar sibling to type a new array element, only when every sibling agrees. */
function sharedElementTemplate(elements: unknown[]): unknown {
  const kind = (value: unknown): string | undefined => {
    if (value instanceof Date) return "date";
    if (
      value instanceof ObjectId ||
      value instanceof Long ||
      value instanceof Decimal128 ||
      value instanceof Int32 ||
      value instanceof Double
    ) {
      return (value as { _bsontype: string })._bsontype;
    }
    return undefined;
  };
  const first = kind(elements[0]);
  return first && elements.every((element) => kind(element) === first) ? elements[0] : undefined;
}

/**
 * Preserve the current field's BSON type while accepting the grid's readable JSON-safe value.
 * A validated top-level scalar that cannot keep its type is rejected. Nested values are
 * `lenient`: array positions may shift and nested types may change, so a value that does not
 * fit its current type is stored as the Extended JSON the user wrote instead.
 */
function coerceChangedValue(current: unknown, incoming: unknown, lenient = false): unknown {
  const incomingRecord = isRecord(incoming) ? incoming : undefined;
  let coerced: unknown = MISMATCH;
  let expected: string | undefined;
  if (current instanceof ObjectId) {
    expected = "a 24-character hex ObjectId";
    if (typeof incoming === "string" && OBJECT_ID_TEXT.test(incoming)) {
      coerced = new ObjectId(incoming);
    }
  } else if (current instanceof Date) {
    expected = "an ISO-8601 date/time";
    const instant = typeof incoming === "string" ? parseTimestampInstant(incoming) : undefined;
    if (instant) coerced = instant;
  } else if (isNumericBson(current)) {
    expected =
      current instanceof Long
        ? "a 64-bit integer"
        : current instanceof Decimal128
          ? "a Decimal128 number"
          : "a finite number";
    coerced = coerceNumber(current, incoming, lenient);
  }
  if (expected) {
    if (coerced !== MISMATCH) return coerced;
    // Null and structured values intentionally replace the type; text and numbers do not.
    if (!lenient && (typeof incoming === "string" || typeof incoming === "number")) {
      throw invalidValue(`Expected ${expected}.`);
    }
    return parseDocumentJson({ value: incoming }).value;
  }

  if (current instanceof Binary && typeof incoming === "string") {
    return new Binary(Buffer.from(incoming, "hex"), current.sub_type);
  }
  // Nested binary values are displayed in their normalized `{ type: "Buffer", data }` shape.
  if (
    current instanceof Binary &&
    incomingRecord?.type === "Buffer" &&
    Array.isArray(incomingRecord.data) &&
    incomingRecord.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return new Binary(Buffer.from(incomingRecord.data as number[]), current.sub_type);
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
      isRecord(scope)
        ? (coerceChangedValue(current.scope, scope, true) as Record<string, unknown>)
        : undefined
    );
  }
  if (current instanceof MinKey && incomingRecord?.$minKey === 1) return new MinKey();
  if (current instanceof MaxKey && incomingRecord?.$maxKey === 1) return new MaxKey();
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const template = sharedElementTemplate(current);
    return incoming.map((value, index) =>
      coerceChangedValue(index < current.length ? current[index] : template, value, true)
    );
  }
  if (isRecord(current) && incomingRecord) {
    return Object.fromEntries(
      Object.entries(incomingRecord).map(([key, value]) => [
        key,
        coerceChangedValue(Object.hasOwn(current, key) ? current[key] : undefined, value, true)
      ])
    );
  }
  return parseDocumentJson({ value: incoming }).value;
}

/** Deserialize Extended JSON before inserting a schemaless MongoDB document. */
export async function insertRow(
  client: MongoClient,
  schema: string,
  table: string,
  document: Record<string, unknown>
): Promise<InsertRowResult> {
  const deserialized = parseDocumentJson(document);
  const result = await client.db(schema).collection(table).insertOne(deserialized);
  return { row: normalizeDocument({ ...deserialized, _id: result.insertedId }) };
}

/** Integer-like keys enumerate first in JS objects, so their stored order cannot be rebuilt. */
function hasReorderedKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasReorderedKeys);
  if (!isRecord(value) || "_bsontype" in value || value instanceof Date) return false;
  return Object.entries(value).some(
    ([key, nested]) => /^(?:0|[1-9]\d*)$/.test(key) || hasReorderedKeys(nested)
  );
}

/** Replace a document by `_id` if it still matches the text the editor loaded. */
export async function updateRowByKey(
  client: MongoClient,
  schema: string,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>,
  expectedOriginal?: Record<string, unknown>
): Promise<UpdateRowResult> {
  const id = documentKey(key._id);
  const collection = client.db(schema).collection<StoredDocument>(table);
  const { _id: _omitted, ...replacement } = parseDocumentJson(changes);
  const filter: Record<string, unknown> = { _id: id };

  if (expectedOriginal) {
    const current = await collection.findOne({ _id: id }, EXACT_DOCUMENT_READ);
    if (!current || documentText(current) !== documentText(parseDocumentJson(expectedOriginal))) {
      return { matched: 0 };
    }
    // Guard the replace itself so a write between this read and the replace is detected.
    if (!hasReorderedKeys(current)) {
      filter.$expr = { $eq: ["$$ROOT", { $literal: current }] };
    }
  }

  const result = await collection.findOneAndReplace(filter, replacement);
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
  const id = documentKey(key._id);
  const collection = client.db(schema).collection<StoredDocument>(table);
  const current = await collection.findOne({ _id: id }, { promoteValues: false });
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
    try {
      set[field] = coerceChangedValue(current[field], incoming);
    } catch (error) {
      if (error instanceof Error && "statusCode" in error) {
        error.message = `Field "${field}": ${error.message}`;
      }
      throw error;
    }
  }

  const result = await collection.updateOne(filter, { $set: set });
  return { matched: result.matchedCount };
}

/** Fetch one document as relaxed Extended JSON that saves back to the same BSON types. */
export async function getDocumentText(
  client: MongoClient,
  schema: string,
  table: string,
  id: unknown
): Promise<string | undefined> {
  const document = await client
    .db(schema)
    .collection<StoredDocument>(table)
    .findOne({ _id: documentKey(id) }, EXACT_DOCUMENT_READ);
  if (!document) return undefined;
  return documentText(document);
}

/** Delete the explicitly requested documents by `_id`. */
export async function deleteRowsByKey(
  client: MongoClient,
  schema: string,
  table: string,
  keys: Array<Record<string, unknown>>
): Promise<DeleteRowsResult> {
  const ids = keys.map((key) => documentKey(key._id));
  const result = await client
    .db(schema)
    .collection<StoredDocument>(table)
    .deleteMany({ _id: { $in: ids } });
  return { deleted: result.deletedCount };
}
