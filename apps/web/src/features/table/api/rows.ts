import type { RowFilter, RowPage, RowSort } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Shared by fetchRows/exportRowsUrl - `filters` is JSON-encoded into one query param (F072),
 * matching the shape packages/core's rowsQuerySchema expects. */
function appendSortAndFilterParams(
  params: URLSearchParams,
  sort: RowSort | undefined,
  filters: RowFilter[] | undefined
): void {
  if (sort) {
    params.set("sortColumn", sort.column);
    params.set("sortDirection", sort.direction);
  }
  if (filters && filters.length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
}

/** Fetch a page of rows for a table, optionally sorted by one column (F065) and/or narrowed by
 * one or more AND-combined filters (F072). */
export function fetchRows(
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort?: RowSort,
  filters?: RowFilter[]
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  appendSortAndFilterParams(params, sort, filters);
  return fetchJson<RowPage>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params}`
  );
}

/**
 * URL for streaming a whole-table CSV export (F066), honoring the given sort/filters if any.
 * Deliberately not fetched via `fetchJson` - the caller triggers a real browser navigation/download
 * to this URL instead, so the download streams straight to disk rather than buffering the whole
 * table in a JS Blob (which would defeat the point of the server streaming it in bounded batches).
 */
export function exportRowsUrl(
  schema: string,
  table: string,
  sort?: RowSort,
  filters?: RowFilter[]
): string {
  const params = new URLSearchParams();
  appendSortAndFilterParams(params, sort, filters);
  const query = params.toString();
  const path = `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/export.csv`;
  return query ? `${path}?${query}` : path;
}
