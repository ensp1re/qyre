import type { ColumnDefinition } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Create a table/collection scoped to an existing schema/database (F110/F113,
 * `POST /api/schemas/:schema/tables`). `columns` is ignored server-side for MongoDB - collections
 * have no fixed structure to declare. */
export function createTable(
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<{ schema: string; table: string }> {
  return fetchJson(`/api/schemas/${encodeURIComponent(schema)}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, columns })
  });
}
