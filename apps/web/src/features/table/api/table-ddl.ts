import type { ColumnDefinition, ColumnUpdateResult, IndexDefinition } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Renames a table/collection (F110/F114, `POST .../ddl/rename`). Non-destructive. */
export function renameTable(
  schema: string,
  table: string,
  newName: string
): Promise<{ schema: string; table: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName })
    }
  );
}

/** Deletes every row from a table/collection, keeping the table itself (F110/F114,
 * `POST .../ddl/truncate`). Destructive - `confirmedName` must match `table` exactly. */
export function truncateTable(
  schema: string,
  table: string,
  confirmedName: string
): Promise<{ schema: string; table: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/truncate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedName })
    }
  );
}

/** Drops a table/collection entirely (F110/F114, `DELETE /api/tables/:schema/:table`).
 * Destructive - `confirmedName` must match `table` exactly. */
export function dropTable(schema: string, table: string, confirmedName: string): Promise<null> {
  return fetchJson(`/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName })
  });
}

/** Adds a column to a SQL table (F111/F114, `POST .../ddl/columns`). Non-destructive. */
export function addColumn(
  schema: string,
  table: string,
  column: ColumnDefinition
): Promise<{ schema: string; table: string; column: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/columns`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(column)
    }
  );
}

/** Renames and/or alters a column in one request (F111/F114, `PATCH .../ddl/columns/:column`) -
 * either or both together, atomically on Postgres/SQLite. `alterError` (F134) is present only on
 * MySQL, whose DDL can't be rolled back: it means the rename already committed while the
 * following alter failed - see {@link ColumnUpdateResult}'s doc comment. */
export function updateColumn(
  schema: string,
  table: string,
  column: string,
  update: { newName?: string; changes?: { dataType?: string; nullable?: boolean } }
): Promise<{ schema: string; table: string } & ColumnUpdateResult> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/columns/${encodeURIComponent(column)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    }
  );
}

/** Drops a column (F111/F114, `DELETE .../ddl/columns/:column`). Destructive - `confirmedName`
 * must match `column` exactly. */
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

/** Creates an index (F112/F114, `POST .../ddl/indexes`). Non-destructive. */
export function createIndex(
  schema: string,
  table: string,
  index: IndexDefinition
): Promise<{ schema: string; table: string; index: string }> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/indexes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(index)
    }
  );
}

/** Drops an index (F112/F114, `DELETE .../ddl/indexes/:indexName`). A plain confirming click, not
 * typed confirmation - an index carries no user data of its own (docs/product-specs/
 * schema-editing.md). */
export function dropIndex(schema: string, table: string, indexName: string): Promise<null> {
  return fetchJson(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl/indexes/${encodeURIComponent(indexName)}`,
    { method: "DELETE" }
  );
}
