import type { TableMetadata } from "@humb/core";

/** Fetch a single table's columns, indexes, and approximate row count. */
export async function fetchTable(schema: string, table: string): Promise<TableMetadata> {
  const response = await fetch(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`
  );
  if (!response.ok) {
    throw new Error(`Failed to load table ${schema}.${table} (status ${response.status})`);
  }
  return (await response.json()) as TableMetadata;
}
