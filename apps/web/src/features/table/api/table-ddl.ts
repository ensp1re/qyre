import type {
  ColumnDefinition,
  ColumnUpdateRequest,
  ColumnUpdateResult,
  IndexDefinition,
  TableReference
} from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function renameTable(
  schema: string,
  table: string,
  newName: string
): Promise<TableReference> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName })
    }
  );
}

export function truncateTable(
  schema: string,
  table: string,
  confirmedName: string
): Promise<TableReference> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/truncate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedName })
    }
  );
}

export function dropTable(schema: string, table: string, confirmedName: string): Promise<null> {
  return fetchJson(`/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName })
  });
}

export function addColumn(
  schema: string,
  table: string,
  column: ColumnDefinition
): Promise<TableReference & { column: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/columns`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(column)
    }
  );
}

export function updateColumn(
  schema: string,
  table: string,
  column: string,
  update: ColumnUpdateRequest
): Promise<TableReference & ColumnUpdateResult> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/columns/${encodeURIComponent(column)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    }
  );
}

export function dropColumn(
  schema: string,
  table: string,
  column: string,
  confirmedName: string
): Promise<null> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/columns/${encodeURIComponent(column)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedName })
    }
  );
}

export function createIndex(
  schema: string,
  table: string,
  index: IndexDefinition
): Promise<TableReference & { index: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/indexes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(index)
    }
  );
}

export function dropIndex(schema: string, table: string, indexName: string): Promise<null> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/indexes/${encodeURIComponent(indexName)}`,
    { method: "DELETE" }
  );
}
