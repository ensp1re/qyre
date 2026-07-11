/** Postgres adapter composition and lifecycle. */
import type {
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  TablePermissions
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  resolvePageRequest,
  runInReadOnlyTransaction,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter, RowMutationApi } from "@qyre/driver-contract";
import type { Pool } from "pg";
import { tableKey } from "./catalog.js";
import { createPostgresPool } from "./connection.js";
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
  public readonly mutations: RowMutationApi = {
    insertRow: (schema, table, values) => insertRow(this.getPool(), schema, table, values),
    updateRowByKey: (schema, table, key, changes) =>
      updateRowByKey(this.getPool(), schema, table, key, changes),
    deleteRowsByKey: (schema, table, keys) => deleteRowsByKey(this.getPool(), schema, table, keys),
    commitBatch: (ops) => commitBatch(this.getPool(), ops)
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
    filters?: RowFilter[]
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters);
    const result = await this.getPool().query(
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
  }

  async runReadOnlyQuery(sql: string): Promise<RowPage> {
    const rewritten = sql.includes('"')
      ? coerceUnknownQuotedIdentifiers(sql, await fetchKnownIdentifiers(this.getPool()))
      : sql;
    assertReadOnly(rewritten);
    const client = await this.getPool().connect();
    return runInReadOnlyTransaction(
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
        release: () => client.release()
      },
      capResultRows(rewritten)
    );
  }
}

export const postgresAdapterFactory: AdapterFactory = {
  engine: "postgres",
  supports: (target) => target.engine === "postgres",
  create: (target) => new PostgresAdapter(target)
};
