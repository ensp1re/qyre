import type { RowSort } from "@qyre/core";
import { EJSON } from "bson";
import type { Filter, MongoClient } from "mongodb";

export async function* streamRows(
  client: MongoClient,
  schema: string,
  table: string,
  filter: Filter<Record<string, unknown>>,
  statementTimeoutMs: number,
  sort?: RowSort
): AsyncIterable<Record<string, unknown>> {
  const cursor = client
    .db(schema)
    .collection<Record<string, unknown>>(table)
    .find(filter, { maxTimeMS: statementTimeoutMs })
    .sort(sort ? { [sort.column]: sort.direction === "asc" ? 1 : -1 } : { _id: 1 });

  try {
    for await (const document of cursor) yield document;
  } finally {
    await cursor.close();
  }
}

export function serializeJsonRow(row: Record<string, unknown>): string {
  return EJSON.stringify(row, { relaxed: true });
}
