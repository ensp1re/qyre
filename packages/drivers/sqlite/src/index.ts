/**
 * SQLite driver for Qyre.
 *
 * Implements the engine-agnostic {@link DatabaseAdapter} contract from `@qyre/driver-contract`.
 * See ARCHITECTURE.md and docs/product-specs/connect-and-inspect-sqlite.md.
 */
import { resolve } from "node:path";
import type {
  ColumnMetadata,
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  FilterOp,
  IndexMetadata,
  RowFilter,
  RowPage,
  RowSort,
  SchemaMetadata,
  TableKind,
  TableMetadata
} from "@qyre/core";
import {
  assertReadOnly,
  capResultRows,
  escapeLikePattern,
  resolvePageRequest,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import Database from "better-sqlite3";

/** SQLite has a single implicit namespace; the UI still expects a schema name, per the spec. */
const MAIN_SCHEMA = "main";

/** Quote a SQL identifier safely (SQLite uses the standard `"..."` convention, like Postgres). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const COMPARE_OPERATORS: Partial<Record<FilterOp, string>> = {
  eq: "=",
  neq: "!=",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">="
};

/** Builds a parameterized `WHERE` clause from validated filters (F072) - `filter.column` is
 * already checked against the table's real columns by the caller (packages/server), `quoteIdent`
 * still guards against a stray identifier-quote character within it, same as sort's `ORDER BY`.
 * SQLite's `LIKE` has no default escape character (unlike Postgres/MySQL), so `ESCAPE '\'` is
 * always stated explicitly rather than relied on implicitly. */
function buildFilterClause(filters: RowFilter[] | undefined): {
  clause: string;
  params: unknown[];
} {
  if (!filters || filters.length === 0) return { clause: "", params: [] };
  const params: unknown[] = [];
  const conditions = filters.map((filter) => {
    const column = quoteIdent(filter.column);
    if (filter.op === "isNull") return `${column} IS NULL`;
    if (filter.op === "isNotNull") return `${column} IS NOT NULL`;
    if (filter.op === "contains") {
      params.push(`%${escapeLikePattern(filter.value ?? "")}%`);
      return `${column} LIKE ? ESCAPE '\\'`;
    }
    params.push(filter.value);
    return `${column} ${COMPARE_OPERATORS[filter.op]} ?`;
  });
  return { clause: ` WHERE ${conditions.join(" AND ")}`, params };
}

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: "c" | "u" | "pk";
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

interface ForeignKeyListRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
}

/**
 * better-sqlite3 returns every INTEGER column as a plain JS number by default, silently losing
 * precision past Number.MAX_SAFE_INTEGER (confirmed live: a stored 9007199254740993n came back as
 * 9007199254740992). `stmt.safeIntegers(true)` (used for the two arbitrary-row-data statements
 * below, not database-wide - `defaultSafeIntegers` would also flip every internal pragma/COUNT(*)
 * query in this file to BigInt, silently breaking `=== 1`/`> 0` comparisons like ping()'s and
 * fetchIndexes()'s) returns BigInt instead - but BigInt has no `toJSON`, so it throws once Fastify
 * JSON-encodes the response. This converts each row's BigInt values back to a plain number when
 * that's lossless (the common case - preserves today's rendering exactly), or a string when it
 * isn't (matching @qyre/postgres/@qyre/mysql's bigint-as-string convention for values a JS
 * number can't hold exactly).
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      normalized[key] =
        value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(value)
          : value.toString();
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

/** The name+kind ('table'|'view') of every non-system relation in `sqlite_master` (F124) - views
 * were previously excluded entirely (`type = 'table'` only), not merely mistagged. */
function fetchAllTableTargets(db: Database.Database): Array<{ name: string; kind: TableKind }> {
  const rows = db
    .prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as Array<{ name: string; type: "table" | "view" }>;
  return rows.map((row) => ({ name: row.name, kind: row.type }));
}

/** Fetch index metadata for a table via SQLite's pragmas. */
function fetchIndexes(db: Database.Database, table: string): IndexMetadata[] {
  const indexList = db.pragma(`index_list(${quoteIdent(table)})`) as IndexListRow[];
  return indexList.map((index) => {
    const indexInfo = db.pragma(`index_info(${quoteIdent(index.name)})`) as IndexInfoRow[];
    return {
      name: index.name,
      columns: indexInfo.map((column) => column.name),
      unique: index.unique === 1,
      primary: index.origin === "pk"
    };
  });
}

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
    const db = this.getDb();
    const tableInfo = db.pragma(`table_info(${quoteIdent(table)})`) as TableInfoRow[];
    const foreignKeyList = db.pragma(
      `foreign_key_list(${quoteIdent(table)})`
    ) as ForeignKeyListRow[];
    const foreignKeys = new Set(foreignKeyList.map((fk) => fk.from));
    // F061: `to` is null when the FK implicitly references the parent table's primary key (legal
    // SQLite shorthand) rather than naming a column - that case is left unresolved (isForeignKey
    // stays true, references stays undefined) rather than guessing which column is the parent's PK.
    const foreignKeyReferences = new Map(
      foreignKeyList
        .filter((fk): fk is ForeignKeyListRow & { to: string } => fk.to !== null)
        .map((fk) => [fk.from, { table: fk.table, column: fk.to }])
    );

    const columns: ColumnMetadata[] = tableInfo.map((row) => ({
      name: row.name,
      // SQLite's declared column type is a free-form string (may even be empty) - "" reads
      // awkwardly in the UI, so fall back to a neutral placeholder rather than an empty cell.
      dataType: row.type || "any",
      nullable: row.notnull === 0,
      isPrimaryKey: row.pk > 0,
      isForeignKey: foreignKeys.has(row.name),
      references: foreignKeyReferences.get(row.name)
    }));

    const indexes = fetchIndexes(db, table);

    const typeRow = db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table) as
      { type: string } | undefined;
    const kind: TableKind = typeRow?.type === "view" ? "view" : "table";

    // A view's COUNT(*) would silently re-execute its own underlying query just to produce a
    // number (F124) - matches the Postgres/MySQL adapters' choice to skip row counts for views.
    const rowCount =
      kind === "view"
        ? undefined
        : (
            db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get() as {
              count: number;
            }
          ).count;

    return { schema, name: table, kind, columns, indexes, rowCount };
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
