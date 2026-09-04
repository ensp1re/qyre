import type {
  ColumnMetadata,
  IndexMetadata,
  SchemaMetadata,
  TableKind,
  TableMetadata
} from "@qyre/core";
import type { Pool } from "pg";
import { SYSTEM_SCHEMAS, tableKey } from "./catalog.js";
import { quoteIdent } from "../query/sql.js";

/** Postgres SQLSTATE for "relation does not exist" - raised when a table is dropped out from under
 * an in-flight introspection query. */
const UNDEFINED_TABLE = "42P01";

interface TableTarget {
  schema: string;
  table: string;
  kind: TableKind;
}

function mapRelkindToTableKind(relkind: string): TableKind {
  if (relkind === "v") return "view";
  if (relkind === "m") return "materialized-view";
  return "table";
}

async function fetchAllTableTargets(pool: Pool): Promise<TableTarget[]> {
  const result = await pool.query<{ table_schema: string; table_name: string; relkind: string }>(
    `SELECT n.nspname AS table_schema, c.relname AS table_name, c.relkind AS relkind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> ALL($1::text[]) AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
      ORDER BY n.nspname, c.relname`,
    [SYSTEM_SCHEMAS]
  );
  return result.rows.map((row) => ({
    schema: row.table_schema,
    table: row.table_name,
    kind: mapRelkindToTableKind(row.relkind)
  }));
}

async function fetchIndexes(pool: Pool, schema: string, table: string): Promise<IndexMetadata[]> {
  const result = await pool.query<{
    index_name: string;
    is_unique: boolean;
    is_primary: boolean;
    columns: string[];
  }>(
    `SELECT ic.relname AS index_name, ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            array_agg(a.attname::text ORDER BY array_position(ix.indkey, a.attnum)) AS columns
       FROM pg_index ix
       JOIN pg_class ic ON ic.oid = ix.indexrelid
       JOIN pg_class tc ON tc.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = tc.relnamespace
       JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = $1 AND tc.relname = $2
      GROUP BY ic.relname, ix.indisunique, ix.indisprimary
      ORDER BY ic.relname`,
    [schema, table]
  );
  return result.rows.map((row) => ({
    name: row.index_name,
    columns: row.columns,
    unique: row.is_unique,
    primary: row.is_primary
  }));
}

async function fetchRowCountAndKind(
  pool: Pool,
  schema: string,
  table: string
): Promise<{ rowCount: number | undefined; kind: TableKind }> {
  const result = await pool.query<{ estimate: string | null; relkind: string | null }>(
    `SELECT reltuples::bigint AS estimate, relkind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, table]
  );
  const row = result.rows[0];
  const kind = mapRelkindToTableKind(row?.relkind ?? "r");
  if (kind === "view") return { rowCount: undefined, kind };
  const estimate = row?.estimate;
  if (estimate == null) return { rowCount: undefined, kind };
  const parsed = Number(estimate);
  if (parsed >= 0) return { rowCount: parsed, kind };
  const exact = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
  return { rowCount: Number(exact.rows[0]?.count ?? 0), kind };
}

export async function introspectSchemas(pool: Pool): Promise<SchemaMetadata[]> {
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
  pool: Pool,
  schema: string,
  table: string
): Promise<TableMetadata> {
  const [columnsResult, keysResult, indexes, rowCountAndKind] = await Promise.all([
    pool.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: "YES" | "NO";
      allowed_values: string[] | null;
      element_data_type: string | null;
    }>(
      `SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable,
              enum_values.allowed_values,
              element_type.typname AS element_data_type
         FROM information_schema.columns c
         LEFT JOIN pg_namespace type_namespace ON type_namespace.nspname = c.udt_schema
         LEFT JOIN pg_type column_type
           ON column_type.typname = c.udt_name AND column_type.typnamespace = type_namespace.oid
         LEFT JOIN pg_type element_type ON element_type.oid = column_type.typelem
         LEFT JOIN LATERAL (
           SELECT json_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS allowed_values
             FROM pg_enum enum_value
            WHERE enum_value.enumtypid = column_type.oid
         ) enum_values ON true
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position`,
      [schema, table]
    ),
    pool.query<{
      constraint_type: "PRIMARY KEY" | "FOREIGN KEY";
      column_name: string;
      referenced_schema: string | null;
      referenced_table: string | null;
      referenced_column: string | null;
    }>(
      `SELECT tc.constraint_type, kcu.column_name,
              ccu.table_schema AS referenced_schema,
              ccu.table_name AS referenced_table,
              ccu.column_name AS referenced_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         LEFT JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
          AND tc.constraint_type = 'FOREIGN KEY'
        WHERE tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
          AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    ),
    fetchIndexes(pool, schema, table),
    fetchRowCountAndKind(pool, schema, table)
  ]);
  const primaryKeys = new Set(
    keysResult.rows
      .filter((row) => row.constraint_type === "PRIMARY KEY")
      .map((row) => row.column_name)
  );
  const foreignKeyReferences = new Map(
    keysResult.rows
      .filter(
        (row): row is typeof row & { referenced_table: string; referenced_column: string } =>
          row.constraint_type === "FOREIGN KEY" &&
          row.referenced_table !== null &&
          row.referenced_column !== null
      )
      .map((row) => [
        row.column_name,
        {
          schema: row.referenced_schema ?? undefined,
          table: row.referenced_table,
          column: row.referenced_column
        }
      ])
  );
  const columns: ColumnMetadata[] = columnsResult.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type === "USER-DEFINED" ? row.udt_name : row.data_type,
    allowedValues: row.allowed_values ?? undefined,
    elementDataType: row.element_data_type ?? undefined,
    nullable: row.is_nullable === "YES",
    isPrimaryKey: primaryKeys.has(row.column_name),
    isForeignKey: foreignKeyReferences.has(row.column_name),
    references: foreignKeyReferences.get(row.column_name)
  }));
  return {
    schema,
    name: table,
    kind: rowCountAndKind.kind,
    columns,
    indexes,
    rowCount: rowCountAndKind.rowCount
  };
}

async function fetchAllColumns(pool: Pool): Promise<Map<string, ColumnMetadata[]>> {
  const [columnsResult, keysResult] = await Promise.all([
    pool.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: "YES" | "NO";
      allowed_values: string[] | null;
      element_data_type: string | null;
    }>(
      `SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
              enum_values.allowed_values,
              element_type.typname AS element_data_type
         FROM information_schema.columns c
         LEFT JOIN pg_namespace type_namespace ON type_namespace.nspname = c.udt_schema
         LEFT JOIN pg_type column_type
           ON column_type.typname = c.udt_name AND column_type.typnamespace = type_namespace.oid
         LEFT JOIN pg_type element_type ON element_type.oid = column_type.typelem
         LEFT JOIN LATERAL (
           SELECT json_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS allowed_values
             FROM pg_enum enum_value
            WHERE enum_value.enumtypid = column_type.oid
         ) enum_values ON true
        WHERE c.table_schema <> ALL($1::text[])
        ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{
      table_schema: string;
      table_name: string;
      constraint_type: "PRIMARY KEY" | "FOREIGN KEY";
      column_name: string;
      referenced_schema: string | null;
      referenced_table: string | null;
      referenced_column: string | null;
    }>(
      `SELECT tc.table_schema, tc.table_name, tc.constraint_type, kcu.column_name,
              ccu.table_schema AS referenced_schema,
              ccu.table_name AS referenced_table,
              ccu.column_name AS referenced_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         LEFT JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
          AND tc.constraint_type = 'FOREIGN KEY'
        WHERE tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
          AND tc.table_schema <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    )
  ]);
  const primaryKeysByTable = new Map<string, Set<string>>();
  const foreignKeysByTable = new Map<
    string,
    Map<string, { schema?: string; table: string; column: string }>
  >();
  for (const row of keysResult.rows) {
    const key = tableKey(row.table_schema, row.table_name);
    if (row.constraint_type === "PRIMARY KEY") {
      const primaryKeys = primaryKeysByTable.get(key) ?? new Set<string>();
      primaryKeys.add(row.column_name);
      primaryKeysByTable.set(key, primaryKeys);
    } else if (row.referenced_table !== null && row.referenced_column !== null) {
      const foreignKeys = foreignKeysByTable.get(key) ?? new Map();
      foreignKeys.set(row.column_name, {
        schema: row.referenced_schema ?? undefined,
        table: row.referenced_table,
        column: row.referenced_column
      });
      foreignKeysByTable.set(key, foreignKeys);
    }
  }
  const columnsByTable = new Map<string, ColumnMetadata[]>();
  for (const row of columnsResult.rows) {
    const key = tableKey(row.table_schema, row.table_name);
    const primaryKeys = primaryKeysByTable.get(key);
    const foreignKeys = foreignKeysByTable.get(key);
    const columns = columnsByTable.get(key) ?? [];
    columns.push({
      name: row.column_name,
      dataType: row.data_type === "USER-DEFINED" ? row.udt_name : row.data_type,
      allowedValues: row.allowed_values ?? undefined,
      elementDataType: row.element_data_type ?? undefined,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys?.has(row.column_name) ?? false,
      isForeignKey: foreignKeys?.has(row.column_name) ?? false,
      references: foreignKeys?.get(row.column_name)
    });
    columnsByTable.set(key, columns);
  }
  return columnsByTable;
}

async function fetchAllIndexes(pool: Pool): Promise<Map<string, IndexMetadata[]>> {
  const result = await pool.query<{
    table_schema: string;
    table_name: string;
    index_name: string;
    is_unique: boolean;
    is_primary: boolean;
    columns: string[];
  }>(
    `SELECT n.nspname AS table_schema, tc.relname AS table_name,
            ic.relname AS index_name, ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            array_agg(a.attname::text ORDER BY array_position(ix.indkey, a.attnum)) AS columns
       FROM pg_index ix
       JOIN pg_class ic ON ic.oid = ix.indexrelid
       JOIN pg_class tc ON tc.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = tc.relnamespace
       JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname <> ALL($1::text[])
      GROUP BY n.nspname, tc.relname, ic.relname, ix.indisunique, ix.indisprimary
      ORDER BY n.nspname, tc.relname, ic.relname`,
    [SYSTEM_SCHEMAS]
  );
  const indexesByTable = new Map<string, IndexMetadata[]>();
  for (const row of result.rows) {
    const key = tableKey(row.table_schema, row.table_name);
    const indexes = indexesByTable.get(key) ?? [];
    indexes.push({
      name: row.index_name,
      columns: row.columns,
      unique: row.is_unique,
      primary: row.is_primary
    });
    indexesByTable.set(key, indexes);
  }
  return indexesByTable;
}

async function fetchAllRowCountEstimates(
  pool: Pool,
  targets: TableTarget[]
): Promise<Map<string, number | undefined>> {
  const countable = targets.filter((target) => target.kind !== "view");
  const result = await pool.query<{ table_schema: string; table_name: string; estimate: string }>(
    `SELECT n.nspname AS table_schema, c.relname AS table_name, c.reltuples::bigint AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> ALL($1::text[]) AND c.relkind <> 'v'`,
    [SYSTEM_SCHEMAS]
  );
  const estimateByTable = new Map<string, number>();
  for (const row of result.rows) {
    estimateByTable.set(tableKey(row.table_schema, row.table_name), Number(row.estimate));
  }
  const rowCountByTable = new Map<string, number | undefined>();
  const unanalyzed = countable.filter(
    ({ schema, table }) => (estimateByTable.get(tableKey(schema, table)) ?? 0) < 0
  );
  // A concurrent DROP can invalidate an exact-count query; treat that relation as having no count.
  const exactCounts = await Promise.all(
    unanalyzed.map(({ schema, table }) =>
      pool
        .query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
        )
        .then((countResult) => Number(countResult.rows[0]?.count ?? 0))
        .catch((error: unknown) => {
          if ((error as { code?: string })?.code === UNDEFINED_TABLE) return undefined;
          throw error;
        })
    )
  );
  const exactByTable = new Map(
    unanalyzed.map(({ schema, table }, index) => [tableKey(schema, table), exactCounts[index]])
  );
  for (const { schema, table } of countable) {
    const key = tableKey(schema, table);
    rowCountByTable.set(
      key,
      exactByTable.has(key) ? exactByTable.get(key) : estimateByTable.get(key)
    );
  }
  return rowCountByTable;
}

export async function introspectAllTables(pool: Pool): Promise<TableMetadata[]> {
  const targets = await fetchAllTableTargets(pool);
  const [columnsByTable, indexesByTable, rowCountByTable] = await Promise.all([
    fetchAllColumns(pool),
    fetchAllIndexes(pool),
    fetchAllRowCountEstimates(pool, targets)
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
