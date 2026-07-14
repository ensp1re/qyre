/** SQLite adapter composition and lifecycle. */
import { resolve } from "node:path";
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
  RowMutationApi,
  SchemaDdlApi
} from "@qyre/driver-contract";
import Database from "better-sqlite3";
import { inspectAccess } from "./access.js";
import { buildSqliteExplainSql, sqlitePlanLines } from "./explain.js";
import { computeCapabilities, tablePermissionsFromCapabilities } from "./capabilities.js";
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
import { fetchAllTableTargets, introspectTable, MAIN_SCHEMA } from "./introspection.js";
import { commitBatch, deleteRowsByKey, insertRow, updateRowByKey } from "./mutations.js";
import { classifySqlitePermissionDenied } from "./permission-errors.js";
import { normalizeRow } from "./row-values.js";
import { formatSqlInsert, streamRows } from "./row-export.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

/**
 * SQLite has no cancellation support (F126) and intentionally omits `operationRegistry` - unlike
 * Postgres/MySQL's connection-pool cancel commands or MongoDB's `killOp`, better-sqlite3 runs every
 * query synchronously on Node's single thread, so the process can't receive and act on a cancel
 * request while a query is in flight; there is no "second connection" to send one from. This is
 * true for reads as much as writes, so a writes-only worker-thread migration (the one place a
 * synchronous engine could plausibly support cancellation) wouldn't help the dominant Cancel use
 * case anyway (the Rows-table fetch is always a read). A full read+write worker-thread rewrite is
 * out of scope for this slice; callers should treat SQLite as non-cancellable and hide/disable any
 * Cancel control for it.
 */
export class SqliteAdapter implements DatabaseAdapter {
  public readonly engine = "sqlite";
  public readonly admin: DatabaseAdminApi = {
    inspectAccess: () => inspectAccess(this.resolvedPath ?? resolve(this.target.raw), this.getDb())
  };
  public readonly mutations: RowMutationApi = {
    // async, not a plain arrow returning Promise.resolve(...) - insertRow() throws synchronously
    // on a readonly database, and only an async function body converts that into a rejection
    // instead of an uncaught throw at the call site (better-sqlite3 has no async API to await).
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
    filters?: RowFilter[]
  ): AsyncIterable<Record<string, unknown>> {
    return streamRows(this.getDb(), table, sort, filters);
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
    try {
      this.db = new Database(this.resolvedPath, { fileMustExist: true });
    } catch {
      // A normal open can fail outright in rare OS-permission edge cases (e.g. the file itself is
      // unreadable) - fall back to an explicit read-only open so Qyre can still inspect the
      // database instead of refusing to connect at all. getCapabilities() (F094) determines real
      // writability independently, so a connection degraded here never gets reported as writable.
      this.db = new Database(this.resolvedPath, { readonly: true, fileMustExist: true });
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

    return { engine: "sqlite", schemas, capabilities: await this.getCapabilities() };
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

  /**
   * SQLite has no cross-table catalog query (each pragma above is per-table by design) - F123's
   * batching win here is moving the fan-out from the *route* (an unbounded `Promise.all` across
   * every adapter call) into the adapter as a plain sequential loop over `introspectTable`.
   * Permissions (F094) are computed once and shared across every table, not recomputed per table -
   * they are uniform for the whole file, unlike Postgres/MySQL's per-table grant queries.
   */
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

    // assertReadOnly is a heuristic string check; SQLite's own `query_only` pragma is the
    // authoritative guarantee, refusing any write regardless of what the string check missed -
    // toggled only around this one query (never left on) since F094 stopped connect() forcing
    // every connection permanently read-only, so the open mode alone no longer guarantees this.
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

  /** F107: executes a single mutation/ddl/confirmed-destructive statement directly, no
   * `query_only` toggling. better-sqlite3's prepared-statement `reader` flag tells us ahead of
   * `.run()`/`.all()` which shape the statement produces - unlike Postgres/MySQL there's no single
   * call that returns either shape uniformly. No statement timeout (better-sqlite3 is synchronous
   * and has none to honor here, matching `runReadOnlyQuery`'s own precedent). */
  async runQuery(sql: string): Promise<QueryExecutionResult> {
    const stmt = this.getDb().prepare(capResultRows(sql)).safeIntegers(true);
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

/** Factory that creates {@link SqliteAdapter} instances for SQLite targets. */
export const sqliteAdapterFactory: AdapterFactory = {
  engine: "sqlite",
  supports: (target) => target.engine === "sqlite",
  create: (target) => new SqliteAdapter(target)
};
