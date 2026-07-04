/**
 * MySQL driver for Humb.
 *
 * Implements the engine-agnostic {@link DatabaseAdapter} contract from `@humbdb/driver-contract`.
 * All MySQL-specific SQL and introspection lives here. See ARCHITECTURE.md and
 * docs/product-specs/connect-and-inspect-mysql.md.
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
import mysql from "mysql2/promise";

export { assertReadOnly, ReadOnlyViolationError } from "@humbdb/driver-contract";

const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];

/** Quote a SQL identifier safely. MySQL uses backticks, not Postgres/SQLite's double quotes. */
function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

/**
 * MySQL's server always returns information_schema query results with UPPERCASE column names
 * regardless of how the query itself is written - explicit lowercase aliases keep row property
 * access predictable, unlike Postgres/SQLite where the written case is preserved.
 */

/** Fetch index metadata for a table via information_schema.statistics. */
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
    if (existing) {
      existing.columns.push(row.column_name);
    } else {
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

export class MysqlAdapter implements DatabaseAdapter {
  public readonly engine = "mysql";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  private pool: mysql.Pool | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error("MysqlAdapter is not connected. Call connect() first.");
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      uri: this.target.raw,
      // Without `dateStrings`, mysql2 returns DATE/DATETIME/TIMESTAMP as JS Date objects built in
      // the server's local time zone, which then serialize to a UTC instant shifted by that offset
      // once Fastify JSON-encodes the response (confirmed live: a stored 2024-01-15 came back as
      // "2024-01-14T22:00:00.000Z" on a UTC+2 server - the wrong calendar date). Raw strings
      // sidestep that round trip, matching @humbdb/postgres's date/timestamp type-parser fix.
      dateStrings: true,
      // Without this, mysql2 returns every BIGINT-family (LONGLONG) value as a plain JS number,
      // silently losing precision past Number.MAX_SAFE_INTEGER (confirmed live: a stored
      // 9007199254740993 came back as 9007199254740992, off by one). The built-in
      // `bigNumberStrings` option fixes that but stringifies by *type*, not magnitude - every
      // LONGLONG field becomes a string even when small, including COUNT(*) and `SELECT 1`
      // (confirmed live: broke ping()'s `=== 1` check and getTable()'s rowCount). This typeCast
      // only stringifies when the actual value exceeds what a JS number can hold exactly, matching
      // @humbdb/sqlite's normalizeRow and @humbdb/postgres/pg's native bigint-as-string behavior.
      typeCast: (field, next) => {
        if (field.type === "LONGLONG") {
          const raw = field.string();
          if (raw === null) return null;
          const value = Number(raw);
          return Number.isSafeInteger(value) ? value : raw;
        }
        return next();
      }
    });
    // Mirrors @humbdb/postgres's pool.on("error", ...): without a listener, an idle connection
    // dropped by the database (restart, network blip) would otherwise crash the whole process
    // instead of /api/health degrading to "disconnected" - see ARCHITECTURE.md's engine checklist
    // and F007's Postgres precedent. The promise Pool's own .on() only types a few non-error
    // events, so the listener attaches to the underlying callback pool it wraps instead. Routed
    // through onConnectionEvent (see @humbdb/postgres's identical precedent) so it reaches the
    // Console tab's event log instead of just stderr.
    this.pool.pool.on("error", (error: Error) => {
      const message = `MySQL pool error (connection dropped): ${error.message}`;
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
    const [rows] = await this.getPool().query<mysql.RowDataPacket[]>("SELECT 1 AS ok");
    return (rows[0] as { ok: number } | undefined)?.ok === 1;
  }

  async getVersion(): Promise<string> {
    const [rows] = await this.getPool().query<mysql.RowDataPacket[]>("SELECT VERSION() AS version");
    const raw = (rows[0] as { version: string } | undefined)?.version ?? "";
    // e.g. "8.0.35-0ubuntu0.22.04.1" -> "8.0.35".
    const match = /^(\S+?)(?:-.*)?$/.exec(raw);
    return `MySQL ${match ? match[1] : raw}`;
  }

  async getOverview(): Promise<DatabaseOverview> {
    const [rows] = await this.getPool().query<mysql.RowDataPacket[]>(
      `SELECT table_schema AS table_schema, table_name AS table_name
         FROM information_schema.tables
        WHERE table_schema NOT IN (?, ?, ?, ?)
        ORDER BY table_schema, table_name`,
      SYSTEM_SCHEMAS
    );

    const bySchema = new Map<string, string[]>();
    for (const row of rows as Array<{ table_schema: string; table_name: string }>) {
      const tables = bySchema.get(row.table_schema) ?? [];
      tables.push(row.table_name);
      bySchema.set(row.table_schema, tables);
    }

    const schemas: SchemaMetadata[] = [...bySchema.entries()].map(([name, tables]) => ({
      name,
      tables
    }));

    return { engine: "mysql", schemas };
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const pool = this.getPool();

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
      `SELECT column_name AS column_name
         FROM information_schema.key_column_usage
        WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [schema, table]
    );
    const foreignKeys = new Set(
      (fkResult as Array<{ column_name: string }>).map((row) => row.column_name)
    );

    const columns: ColumnMetadata[] = (
      columnsResult as Array<{ column_name: string; data_type: string; is_nullable: "YES" | "NO" }>
    ).map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys.has(row.column_name),
      isForeignKey: foreignKeys.has(row.column_name)
    }));

    const [indexes, [countResult]] = await Promise.all([
      fetchIndexes(pool, schema, table),
      pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
      )
    ]);
    const rowCount = (countResult[0] as { count: number }).count;

    return { schema, name: table, columns, indexes, rowCount };
  }

  async getRows(schema: string, table: string, page: number, pageSize: number): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);

    const [rows, fields] = await this.getPool().query<mysql.RowDataPacket[]>(
      `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} LIMIT ? OFFSET ?`,
      [safePageSize, offset]
    );

    return {
      columns: fields.map((field) => field.name),
      rows: rows as Array<Record<string, unknown>>,
      page: safePage,
      pageSize: safePageSize
    };
  }

  async runReadOnlyQuery(sql: string): Promise<RowPage> {
    assertReadOnly(sql);

    // assertReadOnly is a heuristic string check and can be bypassed. Running inside a real
    // START TRANSACTION READ ONLY is the authoritative guarantee - MySQL (InnoDB) itself refuses
    // any data-modifying statement here, regardless of what the string check missed. Mirrors
    // @humbdb/postgres's BEGIN TRANSACTION READ ONLY precedent (F006).
    const connection = await this.getPool().getConnection();
    try {
      await connection.query("START TRANSACTION READ ONLY");
      const [rows, fields] = await connection.query<mysql.RowDataPacket[]>(sql);
      await connection.query("COMMIT");
      return {
        columns: fields.map((field) => field.name),
        rows: rows as Array<Record<string, unknown>>,
        page: 0,
        pageSize: rows.length
      };
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }
}

/** Factory that creates {@link MysqlAdapter} instances for MySQL targets. */
export const mysqlAdapterFactory: AdapterFactory = {
  engine: "mysql",
  supports: (target) => target.engine === "mysql",
  create: (target) => new MysqlAdapter(target)
};
