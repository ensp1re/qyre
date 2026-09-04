import type { ColumnDefinition, TableReference } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function createTable(
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<TableReference> {
  return fetchJson(`/api/schemas/${encodeURIComponent(schema)}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, columns })
  });
}
