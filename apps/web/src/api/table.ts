import type { TableMetadata } from "@qyre/core";
import { fetchJson } from "./fetch-json.js";

/** Fetch a single table's columns, indexes, and approximate row count. */
export function fetchTable(schema: string, table: string): Promise<TableMetadata> {
  return fetchJson<TableMetadata>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`
  );
}
