import type { RowExportFormat, RowFilter, RowPage, RowSort } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

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
