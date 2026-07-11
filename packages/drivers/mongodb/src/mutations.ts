import type { InsertRowResult } from "@qyre/core";
import { EJSON } from "bson";
import type { MongoClient } from "mongodb";
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
