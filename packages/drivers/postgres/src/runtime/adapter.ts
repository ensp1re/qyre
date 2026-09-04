/** Postgres adapter composition and lifecycle. */
import { DATABASE_ENGINES } from "@qyre/core";
import type {
  ColumnMetadata,
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  QueryExecutionResult,
  QueryPlanResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  TablePermissions
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  classifyExplainTarget,
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
  ResolvedRowSearch,
  RowMutationApi,
  SchemaDdlApi
} from "@qyre/driver-contract";
import type { Pool } from "pg";
import {
  createDatabase,
  createSchema,
  dropDatabase,
  dropSchema,
  listDatabases
} from "../admin/admin.js";
import { inspectAccess } from "../access/access.js";
import { tableKey } from "../schema/catalog.js";
import { isPgCancelError, withCancellableClient } from "./cancellation.js";
import { createPostgresPool } from "./connection.js";
import { buildPostgresExplainSql, postgresPlanLines } from "../query/explain.js";
import {
  addColumn,
  alterColumn,
  createIndex,
  createTable,
  dropColumn,
  dropIndex,
  dropTable,
  renameAndAlterColumn,
  renameColumn,
  renameTable,
  truncateTable
} from "../schema/ddl.js";
import {
  introspectAllTables,
  introspectSchemas,
  introspectTable
} from "../schema/introspection.js";
import { commitBatch, deleteRowsByKey, insertRow, updateRowByKey } from "../write/mutations.js";
import { classifyPostgresPermissionDenied } from "../access/permission-errors.js";
import {
  fetchAllTablePermissions,
  fetchConnectionCapabilities,
  fetchTablePermissions,
  READ_ONLY_TABLE_PERMISSIONS
} from "../access/permissions.js";
import {
  coerceUnknownQuotedIdentifiers,
  fetchKnownIdentifiers
} from "../schema/quoted-identifiers.js";
import { formatSqlInsert, streamRows } from "../query/row-export.js";
import { buildFilterClause, quoteIdent } from "../query/sql.js";

export class PostgresAdapter implements DatabaseAdapter {
  public readonly engine = DATABASE_ENGINES.postgres;
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
    renameAndAlterColumn: (schema, table, column, update) =>
      renameAndAlterColumn(this.getPool(), schema, table, column, update),
    dropColumn: (schema, table, column) => dropColumn(this.getPool(), schema, table, column),
    createIndex: (schema, table, definition) =>
      createIndex(this.getPool(), schema, table, definition),
    dropIndex: (schema, _table, indexName) => dropIndex(this.getPool(), schema, indexName)
  };
  public readonly admin: DatabaseAdminApi = {
    inspectAccess: () => inspectAccess(this.getPool()),
    listDatabases: () => listDatabases(this.getPool()),
    createDatabase: (name) => createDatabase(this.getPool(), name),
    dropDatabase: (name) => dropDatabase(this.getPool(), name),
    createSchema: (name) => createSchema(this.getPool(), name),
    dropSchema: (name) => dropSchema(this.getPool(), name)
  };
  private pool: Pool | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): Pool {
    if (!this.pool) throw new Error("PostgresAdapter is not connected. Call connect() first.");
    return this.pool;
  }

  streamRows(
    schema: string,
    table: string,
    _columns: readonly ColumnMetadata[],
    sort?: RowSort,
    filters?: RowFilter[],
    search?: ResolvedRowSearch
  ): AsyncIterable<Record<string, unknown>> {
    return streamRows(this.getPool(), schema, table, sort, filters, search);
  }

  formatSqlInsert(
    schema: string,
    table: string,
    columns: readonly string[],
    row: Record<string, unknown>
  ): string {
    return formatSqlInsert(schema, table, columns, row);
  }

  async connect(): Promise<void> {
    this.pool = createPostgresPool(this.target.raw, (error) => {
      const message = `Postgres pool error (connection dropped): ${error.message}`;
      if (this.onConnectionEvent) this.onConnectionEvent("error", message);
      else console.error(message);
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
    const match = /^(\S+)\s+(\S+)/.exec(raw);
    return match ? `${match[1]} ${match[2]}` : raw;
  }

  private reportPermissionIntrospectionFailure(error: unknown): void {
    const detail = error instanceof Error ? error.message : "unknown error";
    const message = `Postgres permission introspection failed; reporting read-only permissions: ${detail}`;
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

  async getOverview(): Promise<DatabaseOverview> {
    return {
      engine: DATABASE_ENGINES.postgres,
      schemas: await introspectSchemas(this.getPool()),
      capabilities: await this.getCapabilities()
    };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    try {
      return await fetchConnectionCapabilities(this.getPool());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return { ...stubReadOnlyCapabilities(true), supportsAccessInspection: true };
    }
  }

  classifyPermissionDenied = classifyPostgresPermissionDenied;

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
    search?: ResolvedRowSearch,
    operationId?: string
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters, search);
    return withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (client, wasCancelledByUser) => {
        try {
          const [result, countResult] = await Promise.all([
            client.query(
              `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${whereClause}${orderBy} LIMIT $${
                filterParams.length + 1
              } OFFSET $${filterParams.length + 2}`,
              [...filterParams, safePageSize, offset]
            ),
            whereClause
              ? client.query(
                  `SELECT COUNT(*)::bigint AS total FROM ${quoteIdent(schema)}.${quoteIdent(table)}${whereClause}`,
                  filterParams
                )
              : Promise.resolve(undefined)
          ]);
          return {
            columns: result.fields.map((field) => field.name),
            rows: result.rows as Array<Record<string, unknown>>,
            page: safePage,
            pageSize: safePageSize,
            ...(countResult ? { total: Number(countResult.rows[0]?.total ?? 0) } : {})
          };
        } catch (error) {
          if (isPgCancelError(error) && wasCancelledByUser()) throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }

  async runReadOnlyQuery(sql: string, operationId?: string): Promise<RowPage> {
    const rewritten = sql.includes('"')
      ? coerceUnknownQuotedIdentifiers(sql, await fetchKnownIdentifiers(this.getPool()))
      : sql;
    assertReadOnly(rewritten);
    return withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (client, wasCancelledByUser) => {
        try {
          return await runInReadOnlyTransaction(
            {
              begin: async () => {
                await client.query("BEGIN TRANSACTION READ ONLY");
              },
              query: async (querySql) => {
                const result = await client.query(querySql);
                return {
                  columns: result.fields.map((field) => field.name),
                  rows: result.rows as Array<Record<string, unknown>>
                };
              },
              commit: async () => {
                await client.query("COMMIT");
              },
              rollback: async () => {
                await client.query("ROLLBACK");
              },
              release: () => {}
            },
            capResultRows(rewritten)
          );
        } catch (error) {
          if (isPgCancelError(error) && wasCancelledByUser()) throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }

  /** Execute a mutation or DDL statement without a read-only transaction wrapper. */
  async runQuery(sql: string, operationId?: string): Promise<QueryExecutionResult> {
    return withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (client, wasCancelledByUser) => {
        try {
          const result = await client.query(sql);
          return {
            columns: result.fields.map((field) => field.name),
            rows: result.rows as Array<Record<string, unknown>>,
            rowsAffected: result.rowCount ?? result.rows.length
          };
        } catch (error) {
          if (isPgCancelError(error) && wasCancelledByUser()) throw new OperationCancelledError();
          throw error;
        }
      }
    );
  }

  async explainQuery(sql: string, analyze = false): Promise<QueryPlanResult> {
    const classification = classifyExplainTarget(sql, analyze);
    const page = await withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      undefined,
      async (client) =>
        runInReadOnlyTransaction(
          {
            begin: async () => {
              await client.query("BEGIN TRANSACTION READ ONLY");
            },
            query: async (querySql) => {
              const result = await client.query(querySql);
              return {
                columns: result.fields.map((field) => field.name),
                rows: result.rows as Array<Record<string, unknown>>
              };
            },
            commit: async () => {
              await client.query("COMMIT");
            },
            rollback: async () => {
              await client.query("ROLLBACK");
            },
            release: () => {}
          },
          buildPostgresExplainSql(sql, analyze)
        )
    );
    return { lines: postgresPlanLines(page.rows), classification, analyzed: analyze };
  }
}

export const postgresAdapterFactory: AdapterFactory = {
  engine: DATABASE_ENGINES.postgres,
  supports: (target) => target.engine === DATABASE_ENGINES.postgres,
  create: (target) => new PostgresAdapter(target)
};
