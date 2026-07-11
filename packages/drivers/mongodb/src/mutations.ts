import type { InsertRowResult, UpdateRowResult } from "@qyre/core";
import { EJSON } from "bson";
import type { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";
import { normalizeDocument } from "./bson-values.js";

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
 */
export async function updateRowByKey(
  client: MongoClient,
  schema: string,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>
): Promise<UpdateRowResult> {
  const id = new ObjectId(key._id as string);
  const deserialized = EJSON.deserialize(changes, { relaxed: true }) as Record<string, unknown>;
  const { _id: _omitted, ...replacement } = deserialized;
  const result = await client
    .db(schema)
    .collection(table)
    .findOneAndReplace({ _id: id }, replacement);
  return { matched: result ? 1 : 0 };
}
