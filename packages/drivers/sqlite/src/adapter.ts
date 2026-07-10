/** SQLite adapter composition and lifecycle. */
import { resolve } from "node:path";
import type {
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  RowFilter,
  RowPage,
  RowSort,
  SchemaMetadata,
  TableMetadata
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  resolvePageRequest,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import Database from "better-sqlite3";
import { fetchAllTableTargets, introspectTable, MAIN_SCHEMA } from "./introspection.js";
import { normalizeRow } from "./row-values.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

export class SqliteAdapter implements DatabaseAdapter {
  public readonly engine = "sqlite";
  private db: Database.Database | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error("SqliteAdapter is not connected. Call connect() first.");
    }
    return this.db;
  }

  async connect(): Promise<void> {
    // The whole connection is opened read-only - the authoritative backstop, equivalent to
    // @qyre/postgres's READ ONLY transaction (see runReadOnlyQuery below and the product spec).
    // SQLite itself refuses any write through this handle, regardless of what assertReadOnly's
    // string scan misses.
    this.db = new Database(resolve(this.target.raw), { readonly: true, fileMustExist: true });
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = undefined;
  }

  async ping(): Promise<boolean> {
    const row = this.getDb().prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    return row?.ok === 1;
  }

  async getVersion(): Promise<string> {
    const row = this.getDb().prepare("SELECT sqlite_version() AS version").get() as {
      version: string;
    };
    return `SQLite ${row.version}`;
  }

  async getOverview(): Promise<DatabaseOverview> {
    const targets = fetchAllTableTargets(this.getDb());

    const schemas: SchemaMetadata[] = [
      { name: MAIN_SCHEMA, tables: targets.map((target) => target.name) }
    ];

    return { engine: "sqlite", schemas, capabilities: await this.getCapabilities() };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    return stubReadOnlyCapabilities(true);
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    return introspectTable(this.getDb(), schema, table);
  }

  /**
   * SQLite has no cross-table catalog query (each pragma above is per-table by design) - F123's
   * batching win here is moving the fan-out from the *route* (an unbounded `Promise.all` across
   * every adapter call) into the adapter as a plain sequential loop reusing `getTable`. Bounded
   * concurrency of 1 is also a non-issue for correctness: better-sqlite3's pragma/prepare calls are
   * synchronous, so nothing actually runs concurrently either way.
   */
  async getAllTables(): Promise<TableMetadata[]> {
    const targets = fetchAllTableTargets(this.getDb());

    const result: TableMetadata[] = [];
    for (const { name } of targets) {
      result.push(await this.getTable(MAIN_SCHEMA, name));
    }
    return result;
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
    // sort.column is already validated by the caller against the table's real columns (F065).
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters);

    const stmt = this.getDb()
      .prepare(`SELECT * FROM ${quoteIdent(table)}${whereClause}${orderBy} LIMIT ? OFFSET ?`)
      .safeIntegers(true);
    const rows = (
      stmt.all(...filterParams, safePageSize, offset) as Array<Record<string, unknown>>
    ).map(normalizeRow);

    return {
      columns: stmt.columns().map((column) => column.name),
      rows,
      page: safePage,
      pageSize: safePageSize
    };
  }

  async runReadOnlyQuery(sql: string): Promise<RowPage> {
    assertReadOnly(sql);

    // assertReadOnly is a heuristic string check; the read-only connection opened in connect() is
    // the authoritative guarantee - SQLite refuses any write through this handle regardless of
    // what the string check missed (see connect()'s comment).
    const stmt = this.getDb().prepare(capResultRows(sql)).safeIntegers(true);
    const rows = (stmt.all() as Array<Record<string, unknown>>).map(normalizeRow);

    return {
      columns: stmt.columns().map((column) => column.name),
      rows,
      page: 0,
      pageSize: rows.length
    };
  }
}

/** Factory that creates {@link SqliteAdapter} instances for SQLite targets. */
export const sqliteAdapterFactory: AdapterFactory = {
  engine: "sqlite",
  supports: (target) => target.engine === "sqlite",
  create: (target) => new SqliteAdapter(target)
};
