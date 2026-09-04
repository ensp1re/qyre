/** SQLite adapter composition and lifecycle. */
import { resolve } from "node:path";
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
  SchemaMetadata,
  TableMetadata
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  classifyExplainTarget,
  ReadOnlyViolationError,
  resolvePageRequest
} from "@qyre/driver-contract";
import type {
  AdapterFactory,
  DatabaseAdapter,
  DatabaseAdminApi,
  ResolvedRowSearch,
  RowMutationApi,
  SchemaDdlApi
} from "@qyre/driver-contract";
import type Database from "better-sqlite3";
import { inspectAccess } from "../access/access.js";
import { buildSqliteExplainSql, sqlitePlanLines } from "../query/explain.js";
import { computeCapabilities, tablePermissionsFromCapabilities } from "./capabilities.js";
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
import { fetchAllTableTargets, introspectTable, MAIN_SCHEMA } from "../schema/introspection.js";
import { commitBatch, deleteRowsByKey, insertRow, updateRowByKey } from "../write/mutations.js";
import { classifySqlitePermissionDenied } from "../access/permission-errors.js";
import { normalizeRow } from "./row-values.js";
import { formatSqlInsert, streamRows } from "../query/row-export.js";
import { buildFilterClause, quoteIdent } from "../query/sql.js";

/** Load the optional native SQLite binding only when SQLite is used. */
async function loadBetterSqlite3(): Promise<typeof Database> {
  try {
    return (await import("better-sqlite3")).default;
  } catch (error) {
    throw Object.assign(
      new Error(
        "SQLite support needs the native better-sqlite3 binding, which is not installed for this " +
          `Node version (${process.version}). Postgres, MySQL, and MongoDB work without it. ` +
          "To use SQLite, reinstall on a Node release with a prebuilt binary (the current LTS), " +
          `or install build tools so it can compile. Original error: ${(error as Error).message}`
      ),
      { statusCode: 400 }
    );
  }
}

/** SQLite queries are synchronous, so no operation cancellation is registered. */
export class SqliteAdapter implements DatabaseAdapter {
  public readonly engine = DATABASE_ENGINES.sqlite;
  public readonly admin: DatabaseAdminApi = {
    inspectAccess: () => inspectAccess(this.resolvedPath ?? resolve(this.target.raw), this.getDb())
  };
  public readonly mutations: RowMutationApi = {
    // Keep this wrapper async so synchronous driver errors become rejected promises.
    insertRow: async (_schema, table, values) => insertRow(this.getDb(), table, values),
    updateRowByKey: async (_schema, table, key, changes) =>
      updateRowByKey(this.getDb(), table, key, changes),
    deleteRowsByKey: async (_schema, table, keys) => deleteRowsByKey(this.getDb(), table, keys),
    commitBatch: async (ops) => commitBatch(this.getDb(), ops)
  };
  public readonly ddl: SchemaDdlApi = {
    createTable: async (_schema, table, columns) => createTable(this.getDb(), table, columns),
    renameTable: async (_schema, table, newName) => renameTable(this.getDb(), table, newName),
    truncateTable: async (_schema, table) => truncateTable(this.getDb(), table),
    dropTable: async (_schema, table) => dropTable(this.getDb(), table),
    addColumn: async (_schema, table, column) => addColumn(this.getDb(), table, column),
    renameColumn: async (_schema, table, column, newName) =>
      renameColumn(this.getDb(), table, column, newName),
    alterColumn: async (_schema, table, column, changes) =>
      alterColumn(this.getDb(), table, column, changes),
    renameAndAlterColumn: async (_schema, table, column, update) =>
      renameAndAlterColumn(this.getDb(), table, column, update),
    dropColumn: async (_schema, table, column) => dropColumn(this.getDb(), table, column),
    createIndex: async (_schema, table, definition) => createIndex(this.getDb(), table, definition),
    dropIndex: async (_schema, _table, indexName) => dropIndex(this.getDb(), indexName)
  };
  private db: Database.Database | undefined;
  private resolvedPath: string | undefined;

  constructor(private readonly target: ConnectionTarget) {}

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error("SqliteAdapter is not connected. Call connect() first.");
    }
    return this.db;
  }

  streamRows(
    _schema: string,
    table: string,
    _columns: readonly ColumnMetadata[],
    sort?: RowSort,
    filters?: RowFilter[],
    search?: ResolvedRowSearch
  ): AsyncIterable<Record<string, unknown>> {
    return streamRows(this.getDb(), table, sort, filters, search);
  }

  formatSqlInsert(
    _schema: string,
    table: string,
    columns: readonly string[],
    row: Record<string, unknown>
  ): string {
    return formatSqlInsert(table, columns, row);
  }

  async connect(): Promise<void> {
    this.resolvedPath = resolve(this.target.raw);
    const Driver = await loadBetterSqlite3();
    try {
      this.db = new Driver(this.resolvedPath, { fileMustExist: true });
    } catch {
      // A normal open can fail outright in rare OS-permission edge cases (e.g. the file itself is
      // unreadable) - fall back to an explicit read-only open so Qyre can still inspect the
      // database instead of refusing to connect at all. getCapabilities() determines real
      // writability independently, so a connection degraded here never gets reported as writable.
      this.db = new Driver(this.resolvedPath, { readonly: true, fileMustExist: true });
    }
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

    return { engine: DATABASE_ENGINES.sqlite, schemas, capabilities: await this.getCapabilities() };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    const resolvedPath = this.resolvedPath ?? resolve(this.target.raw);
    return computeCapabilities(resolvedPath, this.getDb());
  }

  classifyPermissionDenied = classifySqlitePermissionDenied;

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const permissions = tablePermissionsFromCapabilities(await this.getCapabilities());
    return { ...introspectTable(this.getDb(), schema, table), permissions };
  }

  /** Enumerate and introspect SQLite tables sequentially. */
  async getAllTables(): Promise<TableMetadata[]> {
    const targets = fetchAllTableTargets(this.getDb());
    const permissions = tablePermissionsFromCapabilities(await this.getCapabilities());

    return targets.map(({ name }) => ({
      ...introspectTable(this.getDb(), MAIN_SCHEMA, name),
      permissions
    }));
  }

  async getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[],
    search?: ResolvedRowSearch
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    // sort.column is already validated by the caller against the table's real columns.
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
      : "";
    const { clause: whereClause, params: filterParams } = buildFilterClause(filters, search);

    const stmt = this.getDb()
      .prepare(`SELECT * FROM ${quoteIdent(table)}${whereClause}${orderBy} LIMIT ? OFFSET ?`)
      .safeIntegers(true);
    const rows = (
      stmt.all(...filterParams, safePageSize, offset) as Array<Record<string, unknown>>
    ).map(normalizeRow);

    const total = whereClause
      ? Number(
          (
            this.getDb()
              .prepare(`SELECT COUNT(*) AS total FROM ${quoteIdent(table)}${whereClause}`)
              .safeIntegers(true)
              .get(...filterParams) as { total: bigint }
          ).total
        )
      : undefined;
    return {
      columns: stmt.columns().map((column) => column.name),
      rows,
      page: safePage,
      pageSize: safePageSize,
      ...(total !== undefined ? { total } : {})
    };
  }

  async runReadOnlyQuery(sql: string): Promise<RowPage> {
    assertReadOnly(sql);

    // Enforce SQLite's authoritative read-only guard for this query.
    const db = this.getDb();
    db.pragma("query_only = 1");
    try {
      const stmt = db.prepare(capResultRows(sql)).safeIntegers(true);
      const rows = (stmt.all() as Array<Record<string, unknown>>).map(normalizeRow);

      return {
        columns: stmt.columns().map((column) => column.name),
        rows,
        page: 0,
        pageSize: rows.length
      };
    } finally {
      db.pragma("query_only = 0");
    }
  }

  /** Execute one mutation, DDL, or confirmed destructive statement. */
  async runQuery(sql: string): Promise<QueryExecutionResult> {
    // Leave writes uncapped; the read row-cap wrapper cannot wrap them safely.
    const stmt = this.getDb().prepare(sql).safeIntegers(true);
    if (stmt.reader) {
      const rows = (stmt.all() as Array<Record<string, unknown>>).map(normalizeRow);
      return {
        columns: stmt.columns().map((column) => column.name),
        rows,
        rowsAffected: rows.length
      };
    }
    const info = stmt.run();
    return { columns: [], rows: [], rowsAffected: info.changes };
  }

  async explainQuery(sql: string, analyze = false): Promise<QueryPlanResult> {
    if (analyze) {
      throw new ReadOnlyViolationError("EXPLAIN ANALYZE is only supported for PostgreSQL.");
    }
    const classification = classifyExplainTarget(sql, false);
    const db = this.getDb();
    db.pragma("query_only = 1");
    try {
      const rows = (
        db.prepare(buildSqliteExplainSql(sql)).safeIntegers(true).all() as Array<
          Record<string, unknown>
        >
      ).map(normalizeRow);
      return { lines: sqlitePlanLines(rows), classification, analyzed: false };
    } finally {
      db.pragma("query_only = 0");
    }
  }
}

/** Factory that creates SQLite adapter instances. */
export const sqliteAdapterFactory: AdapterFactory = {
  engine: DATABASE_ENGINES.sqlite,
  supports: (target) => target.engine === DATABASE_ENGINES.sqlite,
  create: (target) => new SqliteAdapter(target)
};
