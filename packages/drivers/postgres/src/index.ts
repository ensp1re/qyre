/**
 * PostgreSQL driver for Humb.
 *
 * Implements the engine-agnostic {@link DatabaseAdapter} contract from `@humbdb/driver-contract`.
 * All Postgres-specific SQL and introspection lives here. See ARCHITECTURE.md.
 */
import type {
  ColumnMetadata,
  ConnectionTarget,
  DatabaseOverview,
  IndexMetadata,
  RowPage,
  SchemaMetadata,
  TableMetadata
} from "@humbdb/core";
import { assertReadOnly, resolvePageRequest } from "@humbdb/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@humbdb/driver-contract";
import { Pool, types } from "pg";

export { assertReadOnly, ReadOnlyViolationError } from "@humbdb/driver-contract";

// pg's default parsers for `date` (OID 1082) and `timestamp without time zone` (OID 1114) build a
// JS Date at local midnight/local wall-clock time, which then serializes to a shifted UTC instant
// once Fastify JSON-encodes the response - e.g. a `date` of 2024-01-15 comes back as
// "2024-01-14T22:00:00.000Z" on a UTC+2 server, the wrong calendar date entirely. Returning the raw
// wire string instead sidesteps that round trip; `timestamptz` (1184) is untouched since it's
// genuinely an absolute instant and converts to UTC correctly. This is a `pg`-module-wide setting
// (types.setTypeParser has no per-Pool scope), acceptable since @humbdb/postgres is the only
// consumer of this `pg` instance.
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * A heavyweight query (a huge unindexed scan, a cartesian join) would otherwise run to completion
 * with no cap, tying up a pool connection and leaving the browser spinner spinning indefinitely.
 * Configurable via `HUMB_STATEMENT_TIMEOUT_MS` (shared env var name across engines, read at
 * `connect()` time rather than module load so tests can override it per case) so it can be tuned
 * for a slow network/large database.
 */
function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.HUMB_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

/** Quote a SQL identifier safely. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Find the index just past the closing quote of a `'...'` literal starting at `sql[start]`. */
function skipSingleQuotedLiteral(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

/** Find the index just past the closing quote of a `"..."` token starting at `sql[start]`. */
function skipDoubleQuotedToken(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === '"') {
      if (sql[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

/** If `sql[index]` starts a dollar-quote tag (`$$` or `$tag$`), return the full tag, else undefined. */
function matchDollarQuoteTag(sql: string, index: number): string | undefined {
  return /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index))?.[0];
}

/** Find the index just past the matching closing `tag` for a dollar-quoted block starting at `start`. */
function skipDollarQuotedLiteral(sql: string, start: number, tag: string): number {
  const closeIndex = sql.indexOf(tag, start + tag.length);
  return closeIndex === -1 ? sql.length : closeIndex + tag.length;
}

/** Blank out `'...'`/dollar-quoted spans (preserving length) so alias-detection regexes below cannot be fooled by quote characters inside string data. Double-quoted tokens are left as-is - they're what those regexes look for (e.g. `AS "alias"`). */
function maskStringLiterals(sql: string): string {
  let result = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = skipSingleQuotedLiteral(sql, i);
      result += " ".repeat(end - i);
      i = end;
      continue;
    }
    const tag = matchDollarQuoteTag(sql, i);
    if (tag) {
      const end = skipDollarQuotedLiteral(sql, i, tag);
      result += " ".repeat(end - i);
      i = end;
      continue;
    }
    result += sql[i];
    i += 1;
  }
  return result;
}

/**
 * Best-effort (regex heuristic, not a real SQL parser) detection of identifiers a query defines
 * itself - CTE names (`WITH "recent" AS (...)`) and column/table aliases (`AS a`, `AS "Column"`)
 * - so they aren't miscoerced merely for not appearing in `information_schema`, e.g.
 * `SELECT "a" FROM (SELECT 1 AS a) sub`.
 */
function collectLocalIdentifiers(sql: string): Set<string> {
  const masked = maskStringLiterals(sql);
  const identifiers = new Set<string>();
  for (const match of masked.matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s+AS\s*\(/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  for (const match of masked.matchAll(/\bAS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  return identifiers;
}

/**
 * Postgres reserves double quotes for identifiers - unlike MySQL (which treats them as strings by
 * default) and SQLite (which falls back to treating a double-quoted token as a string when it
 * doesn't match a real identifier - a documented quirk, see sqlite.org/quirks.html). Most people
 * write "value" out of habit; Postgres alone throws `column "value" does not exist` for it.
 *
 * Rewrites a double-quoted token to a single-quoted string literal only when it doesn't match any
 * real schema/table/column name in the connected database, nor an identifier the query defines
 * itself (an alias or CTE name) - this never changes a query that already works today (e.g. a
 * legitimately quoted case-sensitive column name is left untouched). Tokenizes the SQL properly
 * rather than regex-replacing raw text, so quotes inside `'...'` string literals and `$$...$$`
 * dollar-quoted blocks are never mistaken for identifier quoting.
 */
export function coerceUnknownQuotedIdentifiers(
  sql: string,
  knownIdentifiers: ReadonlySet<string>
): string {
  const localIdentifiers = collectLocalIdentifiers(sql);
  let result = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = skipSingleQuotedLiteral(sql, i);
      result += sql.slice(i, end);
      i = end;
      continue;
    }

    const tag = matchDollarQuoteTag(sql, i);
    if (tag) {
      const end = skipDollarQuotedLiteral(sql, i, tag);
      result += sql.slice(i, end);
      i = end;
      continue;
    }

    if (sql[i] === '"') {
      const end = skipDoubleQuotedToken(sql, i);
      const token = sql.slice(i, end);
      const inner = token.slice(1, -1).replace(/""/g, '"');
      result +=
        knownIdentifiers.has(inner) || localIdentifiers.has(inner)
          ? token
          : `'${inner.replace(/'/g, "''")}'`;
      i = end;
      continue;
    }

    result += sql[i];
    i += 1;
  }
  return result;
}

/** Every real schema, table, and column name in the connected database, for {@link coerceUnknownQuotedIdentifiers}. */
async function fetchKnownIdentifiers(pool: Pool): Promise<Set<string>> {
  const [schemas, tables, columns] = await Promise.all([
    pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ column_name: string }>(
      `SELECT DISTINCT column_name FROM information_schema.columns
        WHERE table_schema <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    )
  ]);

  const identifiers = new Set<string>();
  for (const row of schemas.rows) identifiers.add(row.schema_name);
  for (const row of tables.rows) identifiers.add(row.table_name);
  for (const row of columns.rows) identifiers.add(row.column_name);
  return identifiers;
}

/** Fetch index metadata for a table via Postgres's system catalogs. */
async function fetchIndexes(pool: Pool, schema: string, table: string): Promise<IndexMetadata[]> {
  const result = await pool.query<{
    index_name: string;
    is_unique: boolean;
    is_primary: boolean;
    columns: string[];
  }>(
    `SELECT
        ic.relname AS index_name,
        ix.indisunique AS is_unique,
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

/** Approximate row count from Postgres's planner statistics (fast; avoids a full table scan). */
async function fetchRowCountEstimate(
  pool: Pool,
  schema: string,
  table: string
): Promise<number | undefined> {
  const result = await pool.query<{ estimate: string | null }>(
    `SELECT reltuples::bigint AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, table]
  );

  const estimate = result.rows[0]?.estimate;
  if (estimate == null) {
    return undefined;
  }

  // reltuples is -1 for a table that has never been ANALYZEd (common right after creation).
  // Fall back to an exact count rather than surface a nonsensical negative number.
  const parsed = Number(estimate);
  if (parsed >= 0) {
    return parsed;
  }

  const exact = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
  return Number(exact.rows[0]?.count ?? 0);
}

export class PostgresAdapter implements DatabaseAdapter {
  public readonly engine = "postgres";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  private pool: Pool | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error("PostgresAdapter is not connected. Call connect() first.");
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.target.raw,
      statement_timeout: resolveStatementTimeoutMs()
    });
    // pg emits "error" on the pool when an idle client's connection is dropped by the
    // database (restart, network blip, admin kill). Without a listener, Node treats that as an
    // unhandled error and crashes the whole process - the opposite of what /api/health is for.
    // Routed through onConnectionEvent (checked at fire time, so it's fine that the server wires
    // it up after connect() returns) so it reaches the Console tab's event log, not just stderr -
    // falls back to console.error if nothing ever set it.
    this.pool.on("error", (error) => {
      const message = `Postgres pool error (connection dropped): ${error.message}`;
      if (this.onConnectionEvent) {
        this.onConnectionEvent("error", message);
      } else {
        console.error(message);
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
  }

  async ping(): Promise<boolean> {
    const result = await this.getPool().query("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  }

  async getVersion(): Promise<string> {
    const result = await this.getPool().query<{ version: string }>("SELECT version() AS version");
    const raw = result.rows[0]?.version ?? "";
    // e.g. "PostgreSQL 16.4 (Debian 16.4-1.pgdg120+1) on x86_64-pc-linux-gnu, ..." -> "PostgreSQL 16.4".
    const match = /^(\S+)\s+(\S+)/.exec(raw);
    return match ? `${match[1]} ${match[2]}` : raw;
  }

  async getOverview(): Promise<DatabaseOverview> {
    const result = await this.getPool().query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_schema <> ALL($1::text[])
        ORDER BY table_schema, table_name`,
      [SYSTEM_SCHEMAS]
    );

    const bySchema = new Map<string, string[]>();
    for (const row of result.rows) {
      const tables = bySchema.get(row.table_schema) ?? [];
      tables.push(row.table_name);
      bySchema.set(row.table_schema, tables);
    }

    const schemas: SchemaMetadata[] = [...bySchema.entries()].map(([name, tables]) => ({
      name,
      tables
    }));

    return { engine: "postgres", schemas };
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const columnsResult = await this.getPool().query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
      [schema, table]
    );

    const pkResult = await this.getPool().query<{ column_name: string }>(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    );
    const primaryKeys = new Set(pkResult.rows.map((row) => row.column_name));

    const fkResult = await this.getPool().query<{ column_name: string }>(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    );
    const foreignKeys = new Set(fkResult.rows.map((row) => row.column_name));

    const columns: ColumnMetadata[] = columnsResult.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys.has(row.column_name),
      isForeignKey: foreignKeys.has(row.column_name)
    }));

    const [indexes, rowCount] = await Promise.all([
      fetchIndexes(this.getPool(), schema, table),
      fetchRowCountEstimate(this.getPool(), schema, table)
    ]);

    return { schema, name: table, columns, indexes, rowCount };
  }

  async getRows(schema: string, table: string, page: number, pageSize: number): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);

    const result = await this.getPool().query(
      `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} LIMIT $1 OFFSET $2`,
      [safePageSize, offset]
    );

    return {
      columns: result.fields.map((field) => field.name),
      rows: result.rows as Array<Record<string, unknown>>,
      page: safePage,
      pageSize: safePageSize
    };
  }

  async runReadOnlyQuery(sql: string): Promise<RowPage> {
    // Only worth the extra round trip when the query actually contains a double-quoted token.
    const rewritten = sql.includes('"')
      ? coerceUnknownQuotedIdentifiers(sql, await fetchKnownIdentifiers(this.getPool()))
      : sql;
    assertReadOnly(rewritten);

    // assertReadOnly is a heuristic string check and can be bypassed (e.g. a writable CTE like
    // `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` starts with the allowed "with"
    // keyword). Running inside a real Postgres READ ONLY transaction is the authoritative
    // guarantee: Postgres itself refuses any data-modifying statement here, regardless of what the
    // string check missed.
    const client = await this.getPool().connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const result = await client.query(rewritten);
      await client.query("COMMIT");
      return {
        columns: result.fields.map((field) => field.name),
        rows: result.rows as Array<Record<string, unknown>>,
        page: 0,
        pageSize: result.rows.length
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Factory that creates {@link PostgresAdapter} instances for Postgres targets. */
export const postgresAdapterFactory: AdapterFactory = {
  engine: "postgres",
  supports: (target) => target.engine === "postgres",
  create: (target) => new PostgresAdapter(target)
};
