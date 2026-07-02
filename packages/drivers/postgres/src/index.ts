/**
 * PostgreSQL driver for Humb.
 *
 * Implements the engine-agnostic {@link DatabaseAdapter} contract from `@humb/driver-contract`.
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
} from "@humb/core";
import { assertReadOnly, resolvePageRequest } from "@humb/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@humb/driver-contract";
import { Pool } from "pg";

export { assertReadOnly, ReadOnlyViolationError } from "@humb/driver-contract";

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/** Quote a SQL identifier safely. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
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
  private pool: Pool | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error("PostgresAdapter is not connected. Call connect() first.");
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = new Pool({ connectionString: this.target.raw });
    // pg emits "error" on the pool when an idle client's connection is dropped by the
    // database (restart, network blip, admin kill). Without a listener, Node treats that as an
    // unhandled error and crashes the whole process - the opposite of what /api/health is for.
    this.pool.on("error", (error) => {
      console.error("Postgres pool error (connection dropped):", error.message);
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

    const columns: ColumnMetadata[] = columnsResult.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys.has(row.column_name)
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
    assertReadOnly(sql);

    // assertReadOnly is a heuristic string check and can be bypassed (e.g. a writable CTE like
    // `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` starts with the allowed "with"
    // keyword). Running inside a real Postgres READ ONLY transaction is the authoritative
    // guarantee: Postgres itself refuses any data-modifying statement here, regardless of what the
    // string check missed.
    const client = await this.getPool().connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const result = await client.query(sql);
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
