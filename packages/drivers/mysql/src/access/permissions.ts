import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";
import type mysql from "mysql2/promise";
import { SYSTEM_SCHEMAS } from "../schema/catalog.js";

export const READ_ONLY_TABLE_PERMISSIONS: TablePermissions = {
  select: false,
  insert: false,
  update: false,
  delete: false
};

interface ParsedGrant {
  /** Privilege names as MySQL prints them, e.g. "SELECT", "ALL PRIVILEGES", "CREATE TEMPORARY TABLES". */
  privileges: string[];
  /** Schema name, or "*" for a global (`*.*`) grant. */
  schema: string;
  /** Table name, or "*" for a schema-wide (`db.*`) grant. */
  table: string;
}

/** Strips MySQL's optional backtick-quoting from one identifier. */
function unquoteIdentifier(raw: string): string {
  if (raw === "*") return "*";
  return raw.replace(/^`|`$/g, "").replace(/``/g, "`");
}

/** Parse one `SHOW GRANTS` line with a schema or table target. */
function parseGrantLine(line: string): ParsedGrant | undefined {
  const match = /^GRANT\s+(.+?)\s+ON\s+(\S+)\s+TO\s+/i.exec(line.trim());
  if (!match) return undefined;
  const [, privilegeList, target] = match;
  if (!privilegeList || !target) return undefined;
  const dotIndex = target.indexOf(".");
  if (dotIndex === -1) return undefined;
  return {
    privileges: privilegeList.split(",").map((privilege) => privilege.trim().toUpperCase()),
    schema: unquoteIdentifier(target.slice(0, dotIndex)),
    table: unquoteIdentifier(target.slice(dotIndex + 1))
  };
}

/** Every grant applicable to the current session, including active default roles. */
export async function fetchGrantLines(pool: mysql.Pool): Promise<string[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>("SHOW GRANTS");
  return rows.map((row) => String(Object.values(row)[0]));
}

async function fetchParsedGrants(pool: mysql.Pool): Promise<ParsedGrant[]> {
  return (await fetchGrantLines(pool))
    .map(parseGrantLine)
    .filter((grant): grant is ParsedGrant => grant !== undefined);
}

function matchesPrivilege(grant: ParsedGrant, privileges: string[]): boolean {
  return (
    grant.privileges.includes("ALL PRIVILEGES") ||
    privileges.some((privilege) => grant.privileges.includes(privilege))
  );
}

/** A grant scoped to exactly `*.*` (the whole server). */
function hasGlobalPrivilege(grants: ParsedGrant[], privileges: string[]): boolean {
  return grants.some((grant) => grant.schema === "*" && matchesPrivilege(grant, privileges));
}

/** A global grant, or a `db.*` grant on any non-system schema. */
function hasSchemaWidePrivilege(grants: ParsedGrant[], privileges: string[]): boolean {
  return grants.some(
    (grant) =>
      matchesPrivilege(grant, privileges) &&
      (grant.schema === "*" || (!SYSTEM_SCHEMAS.includes(grant.schema) && grant.table === "*"))
  );
}

/** A global grant, or any grant (schema-wide or single-table) on a non-system schema. */
function hasAnyPrivilege(grants: ParsedGrant[], privileges: string[]): boolean {
  return grants.some(
    (grant) =>
      matchesPrivilege(grant, privileges) &&
      (grant.schema === "*" || !SYSTEM_SCHEMAS.includes(grant.schema))
  );
}

/** Resolve table-level CRUD permissions from the parsed grant list. */
function tablePermissionsFromGrants(
  grants: ParsedGrant[],
  schema: string,
  table: string
): TablePermissions {
  const matches = (privilege: string): boolean =>
    grants.some((grant) => {
      if (!matchesPrivilege(grant, [privilege])) return false;
      if (grant.schema === "*") return true;
      if (grant.schema !== schema) return false;
      return grant.table === "*" || grant.table === table;
    });
  return {
    select: matches("SELECT"),
    insert: matches("INSERT"),
    update: matches("UPDATE"),
    delete: matches("DELETE")
  };
}

export async function fetchTablePermissions(
  pool: mysql.Pool,
  schema: string,
  table: string
): Promise<TablePermissions> {
  const grants = await fetchParsedGrants(pool);
  return tablePermissionsFromGrants(grants, schema, table);
}

/** Resolve SELECT visibility for every non-system table. */
export async function fetchAllTablePermissions(
  pool: mysql.Pool
): Promise<Map<string, TablePermissions>> {
  const [grants, [rows]] = await Promise.all([
    fetchParsedGrants(pool),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT table_schema AS table_schema, table_name AS table_name
         FROM information_schema.tables
        WHERE table_schema NOT IN (?, ?, ?, ?)`,
      SYSTEM_SCHEMAS
    )
  ]);
  const targets = rows as Array<{ table_schema: string; table_name: string }>;
  return new Map(
    targets.map(({ table_schema, table_name }) => [
      JSON.stringify([table_schema, table_name]),
      tablePermissionsFromGrants(grants, table_schema, table_name)
    ])
  );
}

/** Convert MySQL session and grant facts to the shared capability contract. */
export async function fetchConnectionCapabilities(
  pool: mysql.Pool
): Promise<ConnectionCapabilities> {
  const [sessionRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT @@global.read_only AS is_global_read_only, @@session.transaction_read_only AS is_session_read_only"
  );
  const session = sessionRows[0] as
    { is_global_read_only: number; is_session_read_only: number } | undefined;
  if (!session) throw new Error("Could not read MySQL session read-only variables.");
  const isGlobalReadOnly = Boolean(session.is_global_read_only);
  const isSessionReadOnly = Boolean(session.is_session_read_only);

  const grants = await fetchParsedGrants(pool);
  const isSuper = hasGlobalPrivilege(grants, ["SUPER", "SYSTEM_VARIABLES_ADMIN"]);
  const canCreateDatabase = hasGlobalPrivilege(grants, ["CREATE"]);
  const canCreateInSchema = hasSchemaWidePrivilege(grants, ["CREATE"]);
  const canMutateRows = hasAnyPrivilege(grants, ["INSERT", "UPDATE", "DELETE"]);
  const canManageIndexes = hasAnyPrivilege(grants, ["INDEX", "ALTER"]);

  const sessionWritable = !isGlobalReadOnly && !isSessionReadOnly;
  const supportsRowMutations =
    sessionWritable && (canCreateDatabase || canCreateInSchema || canMutateRows);
  const supportsDdl = sessionWritable && (canCreateDatabase || canCreateInSchema);
  const supportsIndexManagement =
    sessionWritable && (isSuper || canCreateDatabase || canCreateInSchema || canManageIndexes);
  const supportsDatabaseManagement = sessionWritable && (isSuper || canCreateDatabase);
  const supportsTransactions =
    sessionWritable && (canCreateDatabase || canCreateInSchema || canMutateRows || isSuper);
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
    supportsAccessInspection: true,
    supportsRowMutations,
    supportsDdl,
    supportsIndexManagement,
    supportsDatabaseManagement,
    supportsTransactions,
    readOnlyReason: hasWriteCapability
      ? null
      : isGlobalReadOnly
        ? "replica"
        : isSessionReadOnly
          ? "connection"
          : "grants"
  };
}
