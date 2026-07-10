/** MySQL adapter composition and lifecycle. */
import type {
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  resolvePageRequest,
  runInReadOnlyTransaction,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import mysql from "mysql2/promise";
import { introspectAllTables, introspectSchemas, introspectTable } from "./introspection.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

export class MysqlAdapter implements DatabaseAdapter {
  public readonly engine = "mysql";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  private pool: mysql.Pool | undefined;
  private statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): mysql.Pool {
    if (!this.pool) throw new Error("MysqlAdapter is not connected. Call connect() first.");
    return this.pool;
  }

  async connect(): Promise<void> {
    this.statementTimeoutMs = resolveStatementTimeoutMs();
    this.pool = mysql.createPool({
      uri: this.target.raw,
      dateStrings: true,
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
    this.pool.pool.on("error", (error: Error) => {
      const message = `MySQL pool error (connection dropped): ${error.message}`;
      if (this.onConnectionEvent) this.onConnectionEvent("error", message);
      else console.error(message);
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
    const match = /^(\S+?)(?:-.*)?$/.exec(raw);
    return `MySQL ${match ? match[1] : raw}`;
  }

  async getOverview(): Promise<DatabaseOverview> {
    return {
      engine: "mysql",
      schemas: await introspectSchemas(this.getPool()),
      capabilities: await this.getCapabilities()
    };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    return stubReadOnlyCapabilities(true);
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    return introspectTable(this.getPool(), schema, table);
  }

  async getAllTables(): Promise<TableMetadata[]> {
    return introspectAllTables(this.getPool());
  }

  async getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[]
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters);
    const [rows, fields] = await this.getPool().query<mysql.RowDataPacket[]>(
      {
        sql: `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${whereClause}${orderBy} LIMIT ? OFFSET ?`,
        timeout: this.statementTimeoutMs
      },
      [...filterParams, safePageSize, offset]
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
    const connection = await this.getPool().getConnection();
    return runInReadOnlyTransaction(
      {
        begin: async () => {
          await connection.query("START TRANSACTION READ ONLY");
        },
        query: async (querySql) => {
          const [rows, fields] = await connection.query<mysql.RowDataPacket[]>({
            sql: querySql,
            timeout: this.statementTimeoutMs
          });
          return {
            columns: fields.map((field) => field.name),
            rows: rows as Array<Record<string, unknown>>
          };
        },
        commit: async () => {
          await connection.query("COMMIT");
        },
        rollback: async () => {
          await connection.query("ROLLBACK");
        },
        release: () => connection.release()
      },
      capResultRows(sql)
    );
  }
}

export const mysqlAdapterFactory: AdapterFactory = {
  engine: "mysql",
  supports: (target) => target.engine === "mysql",
  create: (target) => new MysqlAdapter(target)
};
