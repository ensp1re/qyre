import type { RowPage } from "@humb/core";

/** Fetch a page of rows for a table. */
export async function fetchRows(
  schema: string,
  table: string,
  page: number,
  pageSize: number
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await fetch(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params}`
  );
  if (!response.ok) {
    throw new Error(`Failed to load rows for ${schema}.${table} (status ${response.status})`);
  }
  return (await response.json()) as RowPage;
}
