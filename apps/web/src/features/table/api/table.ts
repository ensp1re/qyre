import type { TableMetadata } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchTable(schema: string, table: string): Promise<TableMetadata> {
  return fetchJson<TableMetadata>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`
  );
}
