/**
 * PostgreSQL adapter for Humb.
 *
 * Implements the engine-agnostic {@link DatabaseAdapter} contract from `@humb/db-adapter`.
 * All Postgres-specific SQL and introspection lives here. See ARCHITECTURE.md.
 */
import type {
  ColumnMetadata,
  ConnectionTarget,
  DatabaseOverview,
  RowPage,
  SchemaMetadata,
  TableMetadata
} from "@humb/core";
import type { AdapterFactory, DatabaseAdapter } from "@humb/db-adapter";
import { Pool } from "pg";
import { assertReadOnly } from "./read-only.js";

export { assertReadOnly, ReadOnlyViolationError } from "./read-only.js";

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/** Quote a SQL identifier safely. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
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

    return { schema, name: table, columns };
  }

  async getRows(schema: string, table: string, page: number, pageSize: number): Promise<RowPage> {
    const safePage = Math.max(0, Math.floor(page));
    const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 200);
    const offset = safePage * safePageSize;

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
    const result = await this.getPool().query(sql);
    return {
      columns: result.fields.map((field) => field.name),
      rows: result.rows as Array<Record<string, unknown>>,
      page: 0,
      pageSize: result.rows.length
    };
  }
}

/** Factory that creates {@link PostgresAdapter} instances for Postgres targets. */
export const postgresAdapterFactory: AdapterFactory = {
  engine: "postgres",
  supports: (target) => target.engine === "postgres",
  create: (target) => new PostgresAdapter(target)
};
