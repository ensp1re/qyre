/** Postgres adapter composition and lifecycle. */
import type {
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
  RowMutationApi,
  SchemaDdlApi
} from "@qyre/driver-contract";
import type { Pool } from "pg";
import { tableKey } from "./catalog.js";
import { isPgCancelError, withCancellableClient } from "./cancellation.js";
import { createPostgresPool } from "./connection.js";
import {
  addColumn,
  alterColumn,
  createTable,
  dropColumn,
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
import { coerceUnknownQuotedIdentifiers, fetchKnownIdentifiers } from "./quoted-identifiers.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

export class PostgresAdapter implements DatabaseAdapter {
  public readonly engine = "postgres";
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
    dropColumn: (schema, table, column) => dropColumn(this.getPool(), schema, table, column)
  };
  private pool: Pool | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getPool(): Pool {
    if (!this.pool) throw new Error("PostgresAdapter is not connected. Call connect() first.");
    return this.pool;
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
      engine: "postgres",
      schemas: await introspectSchemas(this.getPool()),
      capabilities: await this.getCapabilities()
    };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    try {
      return await fetchConnectionCapabilities(this.getPool());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return stubReadOnlyCapabilities(true);
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
    return withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (client, wasCancelledByUser) => {
        try {
          const result = await client.query(
            `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${whereClause}${orderBy} LIMIT $${
              filterParams.length + 1
            } OFFSET $${filterParams.length + 2}`,
            [...filterParams, safePageSize, offset]
          );
          return {
            columns: result.fields.map((field) => field.name),
            rows: result.rows as Array<Record<string, unknown>>,
            page: safePage,
            pageSize: safePageSize
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
              // withCancellableClient releases the client in its own `finally` - this callback
              // exists only to satisfy runInReadOnlyTransaction's shape, not to double-release.
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

  /**
   * F107: executes a single mutation/ddl/confirmed-destructive statement directly on the pool, no
   * `READ ONLY` transaction wrapper. CRITICAL: deliberately does NOT call
   * `coerceUnknownQuotedIdentifiers` - that DWIM double-quote-to-string rewrite is acceptable on
   * `runReadOnlyQuery`'s read path but must never silently alter a mutation's SQL (see
   * docs/product-specs/sql-editor.md).
   */
  async runQuery(sql: string, operationId?: string): Promise<QueryExecutionResult> {
    return withCancellableClient(
      this.getPool(),
      this.operationRegistry,
      operationId,
      async (client, wasCancelledByUser) => {
        try {
          const result = await client.query(capResultRows(sql));
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
}

export const postgresAdapterFactory: AdapterFactory = {
  engine: "postgres",
  supports: (target) => target.engine === "postgres",
  create: (target) => new PostgresAdapter(target)
};
