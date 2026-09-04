import type { RowExportFormat, RowFilter, RowPage, RowSort } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Shared by fetchRows/exportRowsUrl - `filters` is JSON-encoded into one query param (F072),
 * matching the shape packages/core's rowsQuerySchema expects. */
function appendSortAndFilterParams(
  params: URLSearchParams,
  sort: RowSort | undefined,
  filters: RowFilter[] | undefined,
  search?: string
): void {
  if (sort) {
    params.set("sortColumn", sort.column);
    params.set("sortDirection", sort.direction);
  }
  if (filters && filters.length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
  if (search?.trim()) params.set("search", search.trim());
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
  search?: string,
  operationId?: string
): Promise<RowPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  appendSortAndFilterParams(params, sort, filters, search);
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
 * A real navigation can't set an Authorization header. It used to carry the session token as a
 * `token` query param, which put a working credential into browser history and any proxy log on
 * the way; it now fetches a single-use, one-minute `grant` first and puts that in the URL instead
 * (PLAN.md P3). Async as a result - the caller awaits the URL before navigating.
 */
export async function exportRowsUrl(
  schema: string,
  table: string,
  format: RowExportFormat,
  sort?: RowSort,
  filters?: RowFilter[],
  search?: string
): Promise<string> {
  const params = new URLSearchParams();
  appendSortAndFilterParams(params, sort, filters, search);
  const { grant } = await fetchJson<{ grant: string }>("/api/exports/grant", { method: "POST" });
  params.set("grant", grant);
  const query = params.toString();
  const path = `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/export.${format}`;
  return query ? `${path}?${query}` : path;
}
