import type {
  ColumnDefinition,
  ColumnUpdateRequest,
  ColumnUpdateResult,
  IndexDefinition
} from "@qyre/core";
import type { Pool, PoolClient } from "pg";
import { quoteIdent } from "../query/sql.js";

/** Queryable pool or transaction client. */
type Queryable = Pool | PoolClient;

/** Format a Postgres DDL default literal. */
function formatDefaultLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Default value must be a finite number.");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function columnDefinitionSql(column: ColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (!column.nullable) parts.push("NOT NULL");
  if (column.default !== null) parts.push(`DEFAULT ${formatDefaultLiteral(column.default)}`);
  return parts.join(" ");
}

export async function createTable(
  pool: Pool,
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`CREATE TABLE ${target} (${columns.map(columnDefinitionSql).join(", ")})`);
}

export async function renameTable(
  pool: Pool,
  schema: string,
  table: string,
  newName: string
): Promise<void> {
  await pool.query(
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`
  );
}

/** Truncate the table without starting a full-database VACUUM. */
export async function truncateTable(pool: Pool, schema: string, table: string): Promise<void> {
  await pool.query(`TRUNCATE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function dropTable(pool: Pool, schema: string, table: string): Promise<void> {
  await pool.query(`DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function addColumn(
  pool: Pool,
  schema: string,
  table: string,
  column: ColumnDefinition
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} ADD COLUMN ${columnDefinitionSql(column)}`);
}

export async function renameColumn(
  pool: Queryable,
  schema: string,
  table: string,
  column: string,
  newName: string
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(
    `ALTER TABLE ${target} RENAME COLUMN ${quoteIdent(column)} TO ${quoteIdent(newName)}`
  );
}

/** Alter each requested Postgres column facet in one ALTER TABLE statement. */
export async function alterColumn(
  pool: Queryable,
  schema: string,
  table: string,
  column: string,
  changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const quotedColumn = quoteIdent(column);
  const clauses: string[] = [];
  if (changes.dataType !== undefined) {
    clauses.push(`ALTER COLUMN ${quotedColumn} TYPE ${changes.dataType}`);
  }
  if (changes.nullable !== undefined) {
    clauses.push(
      `ALTER COLUMN ${quotedColumn} ${changes.nullable ? "DROP NOT NULL" : "SET NOT NULL"}`
    );
  }
  if ("default" in changes) {
    clauses.push(
      changes.default === null
        ? `ALTER COLUMN ${quotedColumn} DROP DEFAULT`
        : `ALTER COLUMN ${quotedColumn} SET DEFAULT ${formatDefaultLiteral(changes.default as string | number | boolean)}`
    );
  }
  if (clauses.length === 0) return;
  await pool.query(`ALTER TABLE ${target} ${clauses.join(", ")}`);
}

/** Apply rename and alter atomically using Postgres's transactional DDL. */
export async function renameAndAlterColumn(
  pool: Pool,
  schema: string,
  table: string,
  column: string,
  update: ColumnUpdateRequest
): Promise<ColumnUpdateResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let currentName = column;
    if (update.newName !== undefined) {
      await renameColumn(client, schema, table, column, update.newName);
      currentName = update.newName;
    }
    if (update.changes !== undefined) {
      await alterColumn(client, schema, table, currentName, update.changes);
    }
    await client.query("COMMIT");
    return {
      column: currentName,
      renamed: update.newName !== undefined,
      altered: update.changes !== undefined
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function dropColumn(
  pool: Pool,
  schema: string,
  table: string,
  column: string
): Promise<void> {
  await pool.query(
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`
  );
}

export async function createIndex(
  pool: Pool,
  schema: string,
  table: string,
  definition: IndexDefinition
): Promise<void> {
  const unique = definition.unique ? "UNIQUE " : "";
  const columns = definition.columns.map(quoteIdent).join(", ");
  await pool.query(
    `CREATE ${unique}INDEX ${quoteIdent(definition.name)} ON ${quoteIdent(schema)}.${quoteIdent(table)} (${columns})`
  );
}

/** Postgres index names are unique per schema, not per table - `table` isn't needed to target the
 * drop, matching `DROP INDEX`'s own grammar. */
export async function dropIndex(pool: Pool, schema: string, indexName: string): Promise<void> {
  await pool.query(`DROP INDEX ${quoteIdent(schema)}.${quoteIdent(indexName)}`);
}
