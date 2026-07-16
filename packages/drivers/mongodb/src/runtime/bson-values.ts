import type { ColumnMetadata } from "@qyre/core";
import {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  Decimal128,
  Long,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from "mongodb";

function bsonType(value: unknown): string | undefined {
  return value && typeof value === "object" && "_bsontype" in value
    ? String((value as { _bsontype?: unknown })._bsontype)
    : undefined;
}

function objectIdText(value: unknown): string | undefined {
  if (!(value instanceof ObjectId) && bsonType(value) !== "ObjectId") return undefined;
  const toHexString = (value as { toHexString?: unknown }).toHexString;
  if (typeof toHexString !== "function") return undefined;
  const text = String(toHexString.call(value));
  return /^[0-9a-f]{24}$/i.test(text) ? text.toLowerCase() : undefined;
}

/** Convert BSON values to readable, JSON-safe values without losing integer precision. */
export function normalizeBsonValue(value: unknown): unknown {
  const objectId = objectIdText(value);
  if (objectId) return objectId;
  if (value instanceof Timestamp) {
    return { t: value.getHighBits() >>> 0, i: value.getLowBits() >>> 0 };
  }
  if (value instanceof Long) {
    const big = value.toBigInt();
    return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(big)
      : value.toString();
  }
  if (value instanceof Decimal128) return value.toString();
  if (value instanceof Binary) return { type: "Buffer", data: Array.from(value.buffer) };
  if (value instanceof Date) return value;
  if (value instanceof Code) {
    return { code: value.code, scope: value.scope ? normalizeBsonValue(value.scope) : undefined };
  }
  if (value instanceof BSONRegExp) {
    return { pattern: value.pattern, options: value.options };
  }
  if (value instanceof RegExp) return { pattern: value.source, options: value.flags };
  if (value instanceof MinKey) return { $minKey: 1 };
  if (value instanceof MaxKey) return { $maxKey: 1 };
  if (value instanceof BSONSymbol) return value.toString();
  if (Array.isArray(value)) return value.map(normalizeBsonValue);
  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      normalized[key] = normalizeBsonValue(nested);
    }
    return normalized;
  }
  return value;
}

export function normalizeDocument(document: Record<string, unknown>): Record<string, unknown> {
  return normalizeBsonValue(document) as Record<string, unknown>;
}

type InferredBsonType =
  | "string"
  | "number"
  | "boolean"
  | "objectId"
  | "date"
  | "array"
  | "binary"
  | "regex"
  | "timestamp"
  | "code"
  | "minKey"
  | "maxKey"
  | "object"
  | "unsupported";

/** Return the coarse BSON type label shown in table metadata. */
export function classifyBsonValue(value: unknown): InferredBsonType | "null" {
  if (value === null || value === undefined) return "null";
  if (objectIdText(value)) return "objectId";
  if (value instanceof Date) return "date";
  if (value instanceof Binary) return "binary";
  if (value instanceof Timestamp) return "timestamp";
  if (value instanceof Code) return "code";
  if (value instanceof BSONRegExp || value instanceof RegExp) return "regex";
  if (value instanceof MinKey) return "minKey";
  if (value instanceof MaxKey) return "maxKey";
  if (value instanceof BSONSymbol) return "unsupported";
  if (Array.isArray(value)) return "array";
  if (value instanceof Long || value instanceof Decimal128 || typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "object";
}

function resolveDataType(types: Set<InferredBsonType>): InferredBsonType | "mixed" | "null" {
  if (types.size === 0) return "null";
  if (types.size > 1) return "mixed";
  for (const type of types) return type;
  return "null";
}

/** Infer field type and nullability from a bounded document sample. */
export function inferColumns(sample: Record<string, unknown>[]): ColumnMetadata[] {
  const fields = new Map<
    string,
    { types: Set<InferredBsonType>; presentCount: number; explicitNull: boolean }
  >();

  for (const document of sample) {
    for (const [key, value] of Object.entries(document)) {
      const observation = fields.get(key) ?? {
        types: new Set<InferredBsonType>(),
        presentCount: 0,
        explicitNull: false
      };
      observation.presentCount += 1;
      const type = classifyBsonValue(value);
      if (type === "null") observation.explicitNull = true;
      else observation.types.add(type);
      fields.set(key, observation);
    }
  }

  return [...fields].map(([name, observation]) => ({
    name,
    dataType: resolveDataType(observation.types),
    nullable: observation.explicitNull || observation.presentCount < sample.length,
    isPrimaryKey: false,
    isForeignKey: false
  }));
}
