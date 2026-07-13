import type { RowExportFormat, RowFilter, RowPage, RowSort } from "@qyre/core";
import { getAuthToken } from "../../../shared/api/auth-token.js";
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
 * one or more AND-combined filters (F072). `operationId` (F126) is an optional client-generated id
 * that `POST /api/operations/:id/cancel` can later use to cancel this same fetch while it's still
 * in flight. */
export function fetchRows(
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort?: RowSort,
  filters?: RowFilter[],
  operationId?: string
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  appendSortAndFilterParams(params, sort, filters);
  if (operationId) params.set("operationId", operationId);
  return fetchJson<RowPage>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?${params}`
  );
}

/**
 * URL for streaming a whole-table export (F118), honoring the given sort/filters if any.
 * Deliberately not fetched via `fetchJson` - the caller triggers a real browser navigation/download
 * to this URL instead, so the download streams straight to disk rather than buffering the whole
 * table in a JS Blob (which would defeat the point of the server streaming it in bounded batches).
 * A real navigation can't set an Authorization header, so the session token (F122) travels as a
 * `token` query param instead - the one route the auth guard accepts that from.
 */
export function exportRowsUrl(
  schema: string,
  table: string,
  format: RowExportFormat,
  sort?: RowSort,
  filters?: RowFilter[]
): string {
  const params = new URLSearchParams();
  appendSortAndFilterParams(params, sort, filters);
  const token = getAuthToken();
  if (token) params.set("token", token);
  const query = params.toString();
  const path = `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/export.${format}`;
  return query ? `${path}?${query}` : path;
}
