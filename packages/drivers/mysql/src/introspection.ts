import type {
  ColumnMetadata,
  IndexMetadata,
  SchemaMetadata,
  TableKind,
  TableMetadata
} from "@qyre/core";
import type mysql from "mysql2/promise";
import { quoteIdent } from "./sql.js";

const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];

function tableKey(schema: string, table: string): string {
  return JSON.stringify([schema, table]);
}

interface TableTarget {
  schema: string;
  table: string;
  kind: TableKind;
}

function mapTableTypeToTableKind(tableType: string): TableKind {
  return tableType === "VIEW" ? "view" : "table";
}

async function fetchAllTableTargets(pool: mysql.Pool): Promise<TableTarget[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_schema AS table_schema, table_name AS table_name, table_type AS table_type
       FROM information_schema.tables
      WHERE table_schema NOT IN (?, ?, ?, ?)
      ORDER BY table_schema, table_name`,
    SYSTEM_SCHEMAS
  );
  return (rows as Array<{ table_schema: string; table_name: string; table_type: string }>).map(
    (row) => ({
      schema: row.table_schema,
      table: row.table_name,
      kind: mapTableTypeToTableKind(row.table_type)
    })
  );
}

async function fetchIndexes(
  pool: mysql.Pool,
  schema: string,
  table: string
): Promise<IndexMetadata[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT index_name AS index_name, non_unique AS non_unique, column_name AS column_name
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ?
      ORDER BY index_name, seq_in_index`,
    [schema, table]
  );
  const byName = new Map<string, { unique: boolean; columns: string[] }>();
  for (const row of rows as Array<{
    index_name: string;
    non_unique: number;
    column_name: string;
  }>) {
    const existing = byName.get(row.index_name);
    if (existing) existing.columns.push(row.column_name);
    else {
      byName.set(row.index_name, { unique: row.non_unique === 0, columns: [row.column_name] });
    }
  }
  return [...byName.entries()].map(([name, { unique, columns }]) => ({
    name,
    columns,
    unique,
    primary: name === "PRIMARY"
  }));
}

async function fetchAllColumns(pool: mysql.Pool): Promise<Map<string, ColumnMetadata[]>> {
  const [columnsResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_schema AS table_schema, table_name AS table_name, column_name AS column_name,
            data_type AS data_type, is_nullable AS is_nullable
       FROM information_schema.columns
      WHERE table_schema NOT IN (?, ?, ?, ?)
      ORDER BY table_schema, table_name, ordinal_position`,
    SYSTEM_SCHEMAS
  );
  const [pkResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_schema AS table_schema, table_name AS table_name, column_name AS column_name
       FROM information_schema.key_column_usage
      WHERE table_schema NOT IN (?, ?, ?, ?) AND constraint_name = 'PRIMARY'`,
    SYSTEM_SCHEMAS
  );
  const primaryKeysByTable = new Map<string, Set<string>>();
  for (const row of pkResult as Array<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>) {
    const key = tableKey(row.table_schema, row.table_name);
    const primaryKeys = primaryKeysByTable.get(key) ?? new Set<string>();
    primaryKeys.add(row.column_name);
    primaryKeysByTable.set(key, primaryKeys);
  }

  const [fkResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_schema AS table_schema, table_name AS table_name, column_name AS column_name,
            referenced_table_schema AS referenced_table_schema,
            referenced_table_name AS referenced_table_name,
            referenced_column_name AS referenced_column_name
       FROM information_schema.key_column_usage
      WHERE table_schema NOT IN (?, ?, ?, ?) AND referenced_table_name IS NOT NULL`,
    SYSTEM_SCHEMAS
  );
  const foreignKeysByTable = new Map<
    string,
    Map<string, { schema: string; table: string; column: string }>
  >();
  for (const row of fkResult as Array<{
    table_schema: string;
    table_name: string;
    column_name: string;
    referenced_table_schema: string;
    referenced_table_name: string;
    referenced_column_name: string;
  }>) {
    const key = tableKey(row.table_schema, row.table_name);
    const foreignKeys = foreignKeysByTable.get(key) ?? new Map();
    foreignKeys.set(row.column_name, {
      schema: row.referenced_table_schema,
      table: row.referenced_table_name,
      column: row.referenced_column_name
    });
    foreignKeysByTable.set(key, foreignKeys);
  }

  const columnsByTable = new Map<string, ColumnMetadata[]>();
  for (const row of columnsResult as Array<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>) {
    const key = tableKey(row.table_schema, row.table_name);
    const primaryKeys = primaryKeysByTable.get(key);
    const foreignKeys = foreignKeysByTable.get(key);
    const columns = columnsByTable.get(key) ?? [];
    columns.push({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys?.has(row.column_name) ?? false,
      isForeignKey: foreignKeys?.has(row.column_name) ?? false,
      references: foreignKeys?.get(row.column_name)
    });
    columnsByTable.set(key, columns);
  }
  return columnsByTable;
}

async function fetchAllIndexes(pool: mysql.Pool): Promise<Map<string, IndexMetadata[]>> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_schema AS table_schema, table_name AS table_name, index_name AS index_name,
            non_unique AS non_unique, column_name AS column_name
       FROM information_schema.statistics
      WHERE table_schema NOT IN (?, ?, ?, ?)
      ORDER BY table_schema, table_name, index_name, seq_in_index`,
    SYSTEM_SCHEMAS
  );
  const byTableAndName = new Map<string, Map<string, { unique: boolean; columns: string[] }>>();
  for (const row of rows as Array<{
    table_schema: string;
    table_name: string;
    index_name: string;
    non_unique: number;
    column_name: string;
  }>) {
    const key = tableKey(row.table_schema, row.table_name);
    const byName =
      byTableAndName.get(key) ?? new Map<string, { unique: boolean; columns: string[] }>();
    const existing = byName.get(row.index_name);
    if (existing) existing.columns.push(row.column_name);
    else {
      byName.set(row.index_name, { unique: row.non_unique === 0, columns: [row.column_name] });
    }
    byTableAndName.set(key, byName);
  }

  const indexesByTable = new Map<string, IndexMetadata[]>();
  for (const [key, byName] of byTableAndName) {
    indexesByTable.set(
      key,
      [...byName.entries()].map(([name, { unique, columns }]) => ({
        name,
        columns,
        unique,
        primary: name === "PRIMARY"
      }))
    );
  }
  return indexesByTable;
}

async function fetchAllRowCounts(
  pool: mysql.Pool,
  allTargets: TableTarget[]
): Promise<Map<string, number>> {
  const rowCountByTable = new Map<string, number>();
  const targets = allTargets.filter((target) => target.kind !== "view");
  if (targets.length === 0) return rowCountByTable;
  const unionSql = targets
    .map(
      ({ schema, table }) =>
        `SELECT ? AS table_schema, ? AS table_name, COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
    )
    .join(" UNION ALL ");
  const params = targets.flatMap(({ schema, table }) => [schema, table]);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(unionSql, params);
  for (const row of rows as Array<{ table_schema: string; table_name: string; count: number }>) {
    rowCountByTable.set(tableKey(row.table_schema, row.table_name), row.count);
  }
  return rowCountByTable;
}

export async function introspectSchemas(pool: mysql.Pool): Promise<SchemaMetadata[]> {
  const targets = await fetchAllTableTargets(pool);
  const bySchema = new Map<string, string[]>();
  for (const { schema, table } of targets) {
    const tables = bySchema.get(schema) ?? [];
    tables.push(table);
    bySchema.set(schema, tables);
  }
  return [...bySchema.entries()].map(([name, tables]) => ({ name, tables }));
}

export async function introspectTable(
  pool: mysql.Pool,
  schema: string,
  table: string
): Promise<TableMetadata> {
  const [columnsResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS column_name, data_type AS data_type, is_nullable AS is_nullable
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position`,
    [schema, table]
  );
  const [pkResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS column_name
       FROM information_schema.key_column_usage
      WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY'`,
    [schema, table]
  );
  const primaryKeys = new Set(
    (pkResult as Array<{ column_name: string }>).map((row) => row.column_name)
  );
  const [fkResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS column_name,
            referenced_table_schema AS referenced_table_schema,
            referenced_table_name AS referenced_table_name,
            referenced_column_name AS referenced_column_name
       FROM information_schema.key_column_usage
      WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
    [schema, table]
  );
  const foreignKeyReferences = new Map(
    (
      fkResult as Array<{
        column_name: string;
        referenced_table_schema: string;
        referenced_table_name: string;
        referenced_column_name: string;
      }>
    ).map((row) => [
      row.column_name,
      {
        schema: row.referenced_table_schema,
        table: row.referenced_table_name,
        column: row.referenced_column_name
      }
    ])
  );
  const columns: ColumnMetadata[] = (
    columnsResult as Array<{ column_name: string; data_type: string; is_nullable: "YES" | "NO" }>
  ).map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    nullable: row.is_nullable === "YES",
    isPrimaryKey: primaryKeys.has(row.column_name),
    isForeignKey: foreignKeyReferences.has(row.column_name),
    references: foreignKeyReferences.get(row.column_name)
  }));
  const [tableTypeResult] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_type AS table_type
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ?`,
    [schema, table]
  );
  const kind = mapTableTypeToTableKind(
    (tableTypeResult[0] as { table_type: string } | undefined)?.table_type ?? "BASE TABLE"
  );
  const [indexes, rowCount] = await Promise.all([
    fetchIndexes(pool, schema, table),
    kind === "view"
      ? Promise.resolve(undefined)
      : pool
          .query<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
          )
          .then(([rows]) => (rows[0] as { count: number }).count)
  ]);
  return { schema, name: table, kind, columns, indexes, rowCount };
}

export async function introspectAllTables(pool: mysql.Pool): Promise<TableMetadata[]> {
  const targets = await fetchAllTableTargets(pool);
  const [columnsByTable, indexesByTable, rowCountByTable] = await Promise.all([
    fetchAllColumns(pool),
    fetchAllIndexes(pool),
    fetchAllRowCounts(pool, targets)
  ]);
  return targets.map(({ schema, table, kind }) => {
    const key = tableKey(schema, table);
    return {
      schema,
      name: table,
      kind,
      columns: columnsByTable.get(key) ?? [],
      indexes: indexesByTable.get(key) ?? [],
      rowCount: rowCountByTable.get(key)
    };
  });
}
