import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";
import type { Pool } from "pg";
import { SYSTEM_SCHEMAS, tableKey } from "./catalog.js";

export const READ_ONLY_TABLE_PERMISSIONS: TablePermissions = {
  select: false,
  insert: false,
  update: false,
  delete: false
};

interface TablePermissionRow {
  table_schema: string;
  table_name: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

function toTablePermissions(
  row: Omit<TablePermissionRow, "table_schema" | "table_name">
): TablePermissions {
  return {
    select: row.select,
    insert: row.insert,
    update: row.update,
    delete: row.delete
  };
}

export async function fetchTablePermissions(
  pool: Pool,
  schema: string,
  table: string
): Promise<TablePermissions> {
  const result = await pool.query<Omit<TablePermissionRow, "table_schema" | "table_name">>(
    `SELECT
        has_table_privilege(current_user, c.oid, 'SELECT') AS select,
        has_table_privilege(current_user, c.oid, 'INSERT') AS insert,
        has_table_privilege(current_user, c.oid, 'UPDATE') AS update,
        has_table_privilege(current_user, c.oid, 'DELETE') AS delete
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
        AND c.relkind IN ('r', 'p', 'f', 'v', 'm')`,
    [schema, table]
  );
  const row = result.rows[0];
  return row ? toTablePermissions(row) : READ_ONLY_TABLE_PERMISSIONS;
}

export async function fetchAllTablePermissions(pool: Pool): Promise<Map<string, TablePermissions>> {
  const result = await pool.query<TablePermissionRow>(
    `SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        has_table_privilege(current_user, c.oid, 'SELECT') AS select,
        has_table_privilege(current_user, c.oid, 'INSERT') AS insert,
        has_table_privilege(current_user, c.oid, 'UPDATE') AS update,
        has_table_privilege(current_user, c.oid, 'DELETE') AS delete
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> ALL($1::text[]) AND c.relkind IN ('r', 'p', 'f', 'v', 'm')`,
    [SYSTEM_SCHEMAS]
  );
  return new Map(
    result.rows.map((row) => [tableKey(row.table_schema, row.table_name), toTablePermissions(row)])
  );
}

interface PostgresPermissionFacts {
  is_replica: boolean;
  is_connection_read_only: boolean;
  is_superuser: boolean;
  can_create_database: boolean;
  can_create_in_schema: boolean;
  can_mutate_rows: boolean;
  owns_a_table: boolean;
}

async function fetchPermissionFacts(pool: Pool): Promise<PostgresPermissionFacts> {
  const result = await pool.query<PostgresPermissionFacts>(
    `SELECT
        pg_is_in_recovery() AS is_replica,
        current_setting('default_transaction_read_only')::boolean AS is_connection_read_only,
        r.rolsuper AS is_superuser,
        r.rolcreatedb OR has_database_privilege(current_user, current_database(), 'CREATE')
          AS can_create_database,
        EXISTS (
          SELECT 1 FROM pg_namespace n
           WHERE n.nspname <> ALL($1::text[])
             AND has_schema_privilege(current_user, n.oid, 'CREATE')
        ) AS can_create_in_schema,
        EXISTS (
          SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname <> ALL($1::text[])
             AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
             AND (
               has_table_privilege(current_user, c.oid, 'INSERT')
               OR has_table_privilege(current_user, c.oid, 'UPDATE')
               OR has_table_privilege(current_user, c.oid, 'DELETE')
             )
        ) AS can_mutate_rows,
        EXISTS (
          SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname <> ALL($1::text[]) AND c.relowner = r.oid
             AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
        ) AS owns_a_table
       FROM pg_roles r
      WHERE r.rolname = current_user`,
    [SYSTEM_SCHEMAS]
  );
  const facts = result.rows[0];
  if (!facts) throw new Error("Current Postgres role was not found in pg_roles.");
  return facts;
}

/** Convert Postgres session and grant facts to the shared capability contract. */
export async function fetchConnectionCapabilities(pool: Pool): Promise<ConnectionCapabilities> {
  const facts = await fetchPermissionFacts(pool);
  const sessionWritable = !facts.is_replica && !facts.is_connection_read_only;
  const supportsRowMutations =
    sessionWritable &&
    (facts.can_create_database || facts.can_create_in_schema || facts.can_mutate_rows);
  const supportsDdl = sessionWritable && (facts.can_create_database || facts.can_create_in_schema);
  const supportsIndexManagement =
    sessionWritable &&
    (facts.is_superuser ||
      facts.can_create_database ||
      facts.can_create_in_schema ||
      facts.owns_a_table);
  const supportsDatabaseManagement =
    sessionWritable && (facts.is_superuser || facts.can_create_database);
  const supportsTransactions =
    sessionWritable &&
    (facts.can_create_database ||
      facts.can_create_in_schema ||
      facts.can_mutate_rows ||
      facts.is_superuser);
  const hasWriteCapability =
    supportsRowMutations ||
    supportsDdl ||
    supportsIndexManagement ||
    supportsDatabaseManagement ||
    supportsTransactions;

  return {
    supportsSql: true,
    rowExportFormats: ["csv", "json", "sql"],
    jsonExportMode: "json",
    supportsRowMutations,
    supportsDdl,
    supportsIndexManagement,
    supportsDatabaseManagement,
    supportsTransactions,
    readOnlyReason: hasWriteCapability
      ? null
      : facts.is_replica
        ? "replica"
        : facts.is_connection_read_only
          ? "connection"
          : "grants"
  };
}
