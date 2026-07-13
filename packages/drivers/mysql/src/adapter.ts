/** MySQL adapter composition and lifecycle. */
import type {
  ColumnMetadata,
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  QueryExecutionResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  TablePermissions
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  OperationCancelledError,
  resolvePageRequest,
  runInReadOnlyTransaction,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import type {
  AdapterFactory,
  CancellationRegistry,
  DatabaseAdapter,
  DatabaseAdminApi,
  RowMutationApi,
  SchemaDdlApi
} from "@qyre/driver-contract";
import mysql from "mysql2/promise";
import { createDatabase, dropDatabase, listDatabases } from "./admin.js";
import { inspectAccess } from "./access.js";
import { tableKey } from "./catalog.js";
import { isMysqlCancelError, withCancellableConnection } from "./cancellation.js";
import {
  addColumn,
  alterColumn,
  createIndex,
  createTable,
  dropColumn,
  dropIndex,
  dropTable,
  renameColumn,
  renameTable,
  truncateTable
} from "./ddl.js";
import { introspectAllTables, introspectSchemas, introspectTable } from "./introspection.js";
import { commitBatch, deleteRowsByKey, insertRow, updateRowByKey } from "./mutations.js";
import {
  fetchAllTablePermissions,
  fetchConnectionCapabilities,
  fetchTablePermissions,
  READ_ONLY_TABLE_PERMISSIONS
} from "./permissions.js";
import { formatSqlInsert, streamRows } from "./row-export.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

export class MysqlAdapter implements DatabaseAdapter {
  public readonly engine = "mysql";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  public operationRegistry?: CancellationRegistry;
  public readonly mutations: RowMutationApi = {
    insertRow: (schema, table, values) => insertRow(this.getPool(), schema, table, values),
    updateRowByKey: (schema, table, key, changes) =>
      updateRowByKey(this.getPool(), schema, table, key, changes),
    deleteRowsByKey: (schema, table, keys) => deleteRowsByKey(this.getPool(), schema, table, keys),
    commitBatch: (ops) => commitBatch(this.getPool(), ops)
  };
  public readonly ddl: SchemaDdlApi = {
    createTable: (schema, table, columns) => createTable(this.getPool(), schema, table, columns),
    renameTable: (schema, table, newName) => renameTable(this.getPool(), schema, table, newName),
    truncateTable: (schema, table) => truncateTable(this.getPool(), schema, table),
    dropTable: (schema, table) => dropTable(this.getPool(), schema, table),
    addColumn: (schema, table, column) => addColumn(this.getPool(), schema, table, column),
    renameColumn: (schema, table, column, newName) =>
      renameColumn(this.getPool(), schema, table, column, newName),
    alterColumn: (schema, table, column, changes) =>
      alterColumn(this.getPool(), schema, table, column, changes),
    dropColumn: (schema, table, column) => dropColumn(this.getPool(), schema, table, column),
    createIndex: (schema, table, definition) =>
      createIndex(this.getPool(), schema, table, definition),
    dropIndex: (schema, table, indexName) => dropIndex(this.getPool(), schema, table, indexName)
  };
  public readonly admin: DatabaseAdminApi = {
    inspectAccess: () => inspectAccess(this.getPool()),
    listDatabases: () => listDatabases(this.getPool()),
    createDatabase: (name) => createDatabase(this.getPool(), name),
    dropDatabase: (name) => dropDatabase(this.getPool(), name)
  };
  private pool: mysql.Pool | undefined;
  private statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): mysql.Pool {
    if (!this.pool) throw new Error("MysqlAdapter is not connected. Call connect() first.");
    return this.pool;
  }

  streamRows(
    schema: string,
    table: string,
    _columns: readonly ColumnMetadata[],
    sort?: RowSort,
    filters?: RowFilter[]
  ): AsyncIterable<Record<string, unknown>> {
    return streamRows(this.getPool(), schema, table, this.statementTimeoutMs, sort, filters);
  }

  formatSqlInsert(
    schema: string,
    table: string,
    columns: readonly string[],
    row: Record<string, unknown>
  ): string {
    return formatSqlInsert(this.getPool(), schema, table, columns, row);
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

  private reportPermissionIntrospectionFailure(error: unknown): void {
    const detail = error instanceof Error ? error.message : "unknown error";
    const message = `MySQL permission introspection failed; reporting read-only permissions: ${detail}`;
    if (this.onConnectionEvent) this.onConnectionEvent("warn", message);
    else console.warn(message);
  }

  private async getTablePermissions(schema: string, table: string): Promise<TablePermissions> {
    try {
      return await fetchTablePermissions(this.getPool(), schema, table);
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return READ_ONLY_TABLE_PERMISSIONS;
    }
  }

  private async getAllTablePermissions(): Promise<Map<string, TablePermissions>> {
    try {
      return await fetchAllTablePermissions(this.getPool());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return new Map();
    }
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    try {
      return await fetchConnectionCapabilities(this.getPool());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return { ...stubReadOnlyCapabilities(true), supportsAccessInspection: true };
    }
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const [metadata, permissions] = await Promise.all([
      introspectTable(this.getPool(), schema, table),
      this.getTablePermissions(schema, table)
    ]);
    return { ...metadata, permissions };
  }

  async getAllTables(): Promise<TableMetadata[]> {
    const [tables, permissionsByTable] = await Promise.all([
      introspectAllTables(this.getPool()),
      this.getAllTablePermissions()
    ]);
    return tables.map((table) => ({
      ...table,
      permissions:
        permissionsByTable.get(tableKey(table.schema, table.name)) ?? READ_ONLY_TABLE_PERMISSIONS
    }));
  }

  async getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[],
    operationId?: string
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters);
    return withCancellableConnection(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (connection, wasCancelledByUser) => {
        try {
          const [rows, fields] = await connection.query<mysql.RowDataPacket[]>(
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
        } catch (error) {
          if (isMysqlCancelError(error) && wasCancelledByUser())
            throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }

  async runReadOnlyQuery(sql: string, operationId?: string): Promise<RowPage> {
    assertReadOnly(sql);
    return withCancellableConnection(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (connection, wasCancelledByUser) => {
        try {
          return await runInReadOnlyTransaction(
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
              // withCancellableConnection releases the connection in its own `finally` - this
              // callback exists only to satisfy runInReadOnlyTransaction's shape.
              release: () => {}
            },
            capResultRows(sql)
          );
        } catch (error) {
          if (isMysqlCancelError(error) && wasCancelledByUser())
            throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }

  /** F107: executes a single mutation/ddl/confirmed-destructive statement directly on the pool, no
   * `START TRANSACTION READ ONLY` wrapper. mysql2 returns `RowDataPacket[]` for a row-returning
   * statement and a `ResultSetHeader` (with `affectedRows`) otherwise - both are handled here since
   * the caller doesn't know ahead of time which shape a given statement produces. */
  async runQuery(sql: string, operationId?: string): Promise<QueryExecutionResult> {
    return withCancellableConnection(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (connection, wasCancelledByUser) => {
        try {
          const [result, fields] = await connection.query<
            mysql.RowDataPacket[] | mysql.ResultSetHeader
          >({
            sql: capResultRows(sql),
            timeout: this.statementTimeoutMs
          });
          if (Array.isArray(result)) {
            return {
              columns: (fields ?? []).map((field) => field.name),
              rows: result as Array<Record<string, unknown>>,
              rowsAffected: result.length
            };
          }
          return { columns: [], rows: [], rowsAffected: result.affectedRows };
        } catch (error) {
          if (isMysqlCancelError(error) && wasCancelledByUser())
            throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }
}

export const mysqlAdapterFactory: AdapterFactory = {
  engine: "mysql",
  supports: (target) => target.engine === "mysql",
  create: (target) => new MysqlAdapter(target)
};
