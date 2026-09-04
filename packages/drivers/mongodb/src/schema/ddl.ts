import type { ColumnDefinition, IndexDefinition } from "@qyre/core";
import type { MongoClient } from "mongodb";

/** MongoDB collections are schemaless; `_columns` is accepted for adapter parity. */
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
