import type { ColumnDefinition } from "@qyre/core";
import type { MongoClient } from "mongodb";

/**
 * MongoDB is schemaless - there is no `ALTER COLLECTION` concept, so `columns` is ignored entirely
 * (accepted only for API-shape parity with the SQL engines), per docs/product-specs/
 * schema-editing.md's "MongoDB's column operations" section.
 */
export async function createTable(
  client: MongoClient,
  schema: string,
  table: string,
  _columns: ColumnDefinition[]
): Promise<void> {
  await client.db(schema).createCollection(table);
}

export async function renameTable(
  client: MongoClient,
  schema: string,
  table: string,
  newName: string
): Promise<void> {
  await client.db(schema).renameCollection(table, newName);
}

export async function truncateTable(
  client: MongoClient,
  schema: string,
  table: string
): Promise<void> {
  await client.db(schema).collection(table).deleteMany({});
}

export async function dropTable(client: MongoClient, schema: string, table: string): Promise<void> {
  await client.db(schema).collection(table).drop();
}
