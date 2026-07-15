import type { ColumnDefinition, ColumnUpdateResult, IndexDefinition } from "@qyre/core";
import type mysql from "mysql2/promise";
import { quoteIdent } from "../query/sql.js";

/**
 * `column.dataType`/`column.name` are already validated by the caller (identifier shape for new
 * names, `dataType` against MySQL's curated type catalog) - see
 * packages/server/src/services/schema/schema-ddl-validation.ts. `pool.escape()` formats the default
 * literal (a value position DDL can't parameter-bind) using mysql2's own escaping rules, which
 * correctly handle the backslash-escape MySQL applies inside string literals by default (unlike a
 * hand-rolled "double the quote" escape, which alone isn't safe here the way it is for Postgres/
 * SQLite string literals).
 */
function columnDefinitionSql(pool: mysql.Pool, column: ColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (!column.nullable) parts.push("NOT NULL");
  if (column.default !== null) parts.push(`DEFAULT ${pool.escape(column.default)}`);
  return parts.join(" ");
}

export async function createTable(
  pool: mysql.Pool,
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const columnsSql = columns.map((column) => columnDefinitionSql(pool, column)).join(", ");
  await pool.query(`CREATE TABLE ${target} (${columnsSql})`);
}

export async function renameTable(
  pool: mysql.Pool,
  schema: string,
  table: string,
  newName: string
): Promise<void> {
  await pool.query(
    `RENAME TABLE ${quoteIdent(schema)}.${quoteIdent(table)} TO ${quoteIdent(schema)}.${quoteIdent(newName)}`
  );
}

export async function truncateTable(
  pool: mysql.Pool,
  schema: string,
  table: string
): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function dropTable(pool: mysql.Pool, schema: string, table: string): Promise<void> {
  await pool.query(`DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function addColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: ColumnDefinition
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} ADD COLUMN ${columnDefinitionSql(pool, column)}`);
}

/** MySQL 8.0+'s native `RENAME COLUMN` (this repo's Docker/CI stack is MySQL 8) - no 5.7
 * `CHANGE COLUMN` fallback, since that version isn't part of this codebase's tested matrix. */
export async function renameColumn(
  pool: mysql.Pool,
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

interface CurrentColumnDefinition {
  columnType: string;
  nullable: boolean;
  /** The raw stored default value's text (e.g. `hello`, `5`), or an expression's text (e.g.
   * `CURRENT_TIMESTAMP`) - `information_schema.COLUMNS.COLUMN_DEFAULT` doesn't distinguish the two,
   * so a preserved (not explicitly changed) expression default is re-quoted as a literal string by
   * `alterColumn` below. Expression defaults are out of scope for what `ColumnDefinition.default`
   * itself can express (docs/product-specs/schema-editing.md) - this is the one place that
   * limitation can surface as a behavior change on an *unrelated* alter, not just a rejected input. */
  default: string | null;
}

async function fetchCurrentColumnDefinition(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string
): Promise<CurrentColumnDefinition> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT column_type AS column_type, is_nullable AS is_nullable, column_default AS column_default
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [schema, table, column]
  );
  const row = rows[0] as
    { column_type: string; is_nullable: "YES" | "NO"; column_default: string | null } | undefined;
  if (!row) throw new Error(`Column "${column}" not found.`);
  return {
    columnType: row.column_type,
    nullable: row.is_nullable === "YES",
    default: row.column_default
  };
}

/**
 * MySQL's `MODIFY COLUMN` requires the full resulting column definition, not just the changed
 * field - there is no separate "just change the type"/"just change nullability" clause the way
 * Postgres has. Reads the column's current definition first (via `information_schema.columns`,
 * not the shared `ColumnMetadata` introspection - `COLUMN_TYPE` carries length/precision
 * `DATA_TYPE` alone doesn't, and `ColumnMetadata` doesn't expose a column's default at all) and
 * merges `changes` onto it, so the caller-facing contract stays "changes covers only what's
 * different" even though MySQL's own SQL doesn't work that way under the hood.
 */
export async function alterColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
): Promise<void> {
  const current = await fetchCurrentColumnDefinition(pool, schema, table, column);
  const columnType = changes.dataType ?? current.columnType;
  const nullable = changes.nullable ?? current.nullable;
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const parts = [quoteIdent(column), columnType];
  if (!nullable) parts.push("NOT NULL");

  const defaultValue = "default" in changes ? changes.default : current.default;
  if (defaultValue !== null && defaultValue !== undefined) {
    parts.push(`DEFAULT ${pool.escape(defaultValue)}`);
  }
  await pool.query(`ALTER TABLE ${target} MODIFY COLUMN ${parts.join(" ")}`);
}

/**
 * Runs a rename and/or alter sequentially (F134) - unlike Postgres/SQLite, MySQL's DDL is not
 * transactional (`ALTER TABLE` auto-commits immediately regardless of any enclosing `BEGIN`/
 * `COMMIT`), so a rename that succeeds can never be rolled back if the following alter then fails.
 * Rather than throw and leave the caller believing nothing happened (the original bug: the rename
 * is already committed, and a naive retry then hits "Unknown column"), a post-rename alter failure
 * is caught and reported as a partial {@link ColumnUpdateResult} instead - `renamed: true, altered:
 * false, alterError`. A failure with nothing yet committed (the alter-only case, or the rename
 * itself failing) still throws normally, matching every other DDL route. Note this bypasses the
 * route's permission-denied classification for the alter step specifically - an acceptable
 * tradeoff for the rare case of "rename allowed, alter forbidden"; the alter's raw message still
 * reaches `alterError`, just not through that structured 403 path.
 */
export async function renameAndAlterColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  update: {
    newName?: string;
    changes?: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>;
  }
): Promise<ColumnUpdateResult> {
  let currentName = column;
  if (update.newName !== undefined) {
    await renameColumn(pool, schema, table, column, update.newName);
    currentName = update.newName;
  }
  if (update.changes === undefined) {
    return { column: currentName, renamed: update.newName !== undefined, altered: false };
  }
  try {
    await alterColumn(pool, schema, table, currentName, update.changes);
  } catch (error) {
    if (update.newName === undefined) throw error;
    return {
      column: currentName,
      renamed: true,
      altered: false,
      alterError: error instanceof Error ? error.message : String(error)
    };
  }
  return { column: currentName, renamed: update.newName !== undefined, altered: true };
}

export async function dropColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} DROP COLUMN ${quoteIdent(column)}`);
}

export async function createIndex(
  pool: mysql.Pool,
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

/** MySQL's `DROP INDEX` requires the table (index names are unique per table, not per schema, and
 * the grammar itself takes an `ON table` clause). */
export async function dropIndex(
  pool: mysql.Pool,
  schema: string,
  table: string,
  indexName: string
): Promise<void> {
  await pool.query(
    `DROP INDEX ${quoteIdent(indexName)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
}
