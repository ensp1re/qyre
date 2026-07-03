import type { RowPage } from "@humbdb/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch a page of rows for a table. */
export function fetchRows(
  schema: string,
  table: string,
  page: number,
  pageSize: number
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return fetchJson<RowPage>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params}`
  );
}
