import type { RowPage, RowSort } from "@humbdb/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch a page of rows for a table, optionally sorted by one column (F065). */
export function fetchRows(
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort?: RowSort
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (sort) {
    params.set("sortColumn", sort.column);
    params.set("sortDirection", sort.direction);
  }
  return fetchJson<RowPage>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params}`
  );
}

/**
 * URL for streaming a whole-table CSV export (F066), honoring the given sort if any. Deliberately
 * not fetched via `fetchJson` - the caller triggers a real browser navigation/download to this URL
 * instead, so the download streams straight to disk rather than buffering the whole table in a JS
 * Blob (which would defeat the point of the server streaming it in bounded batches).
 */
export function exportRowsUrl(schema: string, table: string, sort?: RowSort): string {
  const params = new URLSearchParams();
  if (sort) {
    params.set("sortColumn", sort.column);
    params.set("sortDirection", sort.direction);
  }
  const query = params.toString();
  const path = `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/export.csv`;
  return query ? `${path}?${query}` : path;
}
