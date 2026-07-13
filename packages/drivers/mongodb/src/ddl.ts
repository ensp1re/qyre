import type { ColumnDefinition, IndexDefinition } from "@qyre/core";
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

/** `columns` entries are top-level or dotted field paths (not SQL column names), per
 * docs/product-specs/schema-editing.md - passed straight through as MongoDB's own compound-index
 * key spec (each field ascending, matching every other index this codebase creates). */
export async function createIndex(
  client: MongoClient,
  schema: string,
  table: string,
  definition: IndexDefinition
): Promise<void> {
  const keys: Record<string, 1> = {};
  for (const column of definition.columns) keys[column] = 1;
  await client
    .db(schema)
    .collection(table)
    .createIndex(keys, { name: definition.name, unique: definition.unique });
}

export async function dropIndex(
  client: MongoClient,
  schema: string,
  table: string,
  indexName: string
): Promise<void> {
  await client.db(schema).collection(table).dropIndex(indexName);
}
