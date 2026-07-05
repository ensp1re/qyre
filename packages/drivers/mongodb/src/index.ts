/**
 * MongoDB driver for Humb, scoped to basic read-only browsing (no query runner) - see
 * ARCHITECTURE.md and docs/product-specs/connect-and-inspect-mongodb.md for why this engine's
 * contract is narrower than the SQL engines'.
 */
import type {
  ColumnMetadata,
  ConnectionTarget,
  DatabaseOverview,
  RowPage,
  RowSort,
  SchemaMetadata,
  TableMetadata
} from "@humbdb/core";
import { resolvePageRequest } from "@humbdb/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@humbdb/driver-contract";
import {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  Decimal128,
  Long,
  MaxKey,
  MinKey,
  MongoClient,
  ObjectId,
  Timestamp
} from "mongodb";

const SYSTEM_DATABASES = new Set(["admin", "local", "config"]);

/** How many documents getTable() samples to build its best-effort observed-fields list. */
const FIELD_SAMPLE_SIZE = 100;

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * A heavyweight query (an unindexed scan over a huge collection) would otherwise run to
 * completion with no cap, tying up the connection and leaving the browser spinner spinning
 * indefinitely. Applied via `maxTimeMS` on the row-fetch and field-sampling paths - the server
 * itself enforces the cutoff, unlike mysql2's client-side timeout. Configurable via
 * `HUMB_STATEMENT_TIMEOUT_MS` (shared env var name across engines, read at `connect()` time
 * rather than module load so tests can override it per case).
 */
function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.HUMB_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

/**
 * Recursively converts BSON values that don't serialize to anything useful over JSON into values
 * that do - confirmed live (see F019's precedent) that `JSON.stringify` on a raw driver response
 * turns a `Long` into `{"high":...,"low":...,"unsigned":...}` and a `Decimal128` into
 * `{"$numberDecimal":"19.99"}`, neither remotely readable in the UI. `ObjectId` and `Date` already
 * serialize cleanly (an ObjectId's own `toJSON` returns its hex string, a Date's returns an ISO
 * string - the driver builds Dates from an absolute UTC instant, not server-local wall-clock time,
 * so none of F019's Postgres/MySQL timezone-shift bug applies here) and are left untouched.
 * `Binary` converts to the same `{ type: "Buffer", data: [...] }` shape Node's own
 * `Buffer.prototype.toJSON()` produces, reusing F019's existing binary-value chip/hex-dump viewer
 * in `packages/ui` instead of inventing a second, inconsistent binary representation. `Timestamp`,
 * `Code`, `BSONRegExp`, `MinKey`, `MaxKey`, and `BSONSymbol` (F045) each get a dedicated branch
 * instead of falling through to the generic object branch, which used to dump their internal
 * fields verbatim (e.g. a `Timestamp` - which subclasses `Long` - would otherwise be misread as a
 * signed 64-bit integer, destroying its `{t, i}` replication-timestamp semantics).
 */
export function normalizeBsonValue(value: unknown): unknown {
  // Timestamp subclasses Long (a BSON quirk, not a real 64-bit counter) - it must be checked before
  // the Long branch below, or its {t, i} replication-timestamp semantics get destroyed by Long's
  // signed-64-bit-integer normalization.
  if (value instanceof Timestamp) {
    return { t: value.getHighBits() >>> 0, i: value.getLowBits() >>> 0 };
  }
  if (value instanceof Long) {
    const big = value.toBigInt();
    return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(big)
      : value.toString();
  }
  if (value instanceof Decimal128) {
    return value.toString();
  }
  if (value instanceof Binary) {
    return { type: "Buffer", data: Array.from(value.buffer) };
  }
  if (value instanceof ObjectId || value instanceof Date) {
    return value;
  }
  if (value instanceof Code) {
    return { code: value.code, scope: value.scope ? normalizeBsonValue(value.scope) : undefined };
  }
  if (value instanceof BSONRegExp) {
    return { pattern: value.pattern, options: value.options };
  }
  // The driver decodes a BSON regex into a native RegExp by default (only kept as BSONRegExp with
  // the bsonRegExp: true client option, which this adapter doesn't set) - without this branch it
  // fell through to the generic object branch, which reads no own enumerable properties off a
  // RegExp (source/flags are prototype getters) and produced an empty {}.
  if (value instanceof RegExp) {
    return { pattern: value.source, options: value.flags };
  }
  if (value instanceof MinKey) {
    return { $minKey: 1 };
  }
  if (value instanceof MaxKey) {
    return { $maxKey: 1 };
  }
  if (value instanceof BSONSymbol) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeBsonValue);
  }
  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      normalized[key] = normalizeBsonValue(nested);
    }
    return normalized;
  }
  return value;
}

function normalizeDocument(document: Record<string, unknown>): Record<string, unknown> {
  return normalizeBsonValue(document) as Record<string, unknown>;
}

export class MongodbAdapter implements DatabaseAdapter {
  public readonly engine = "mongodb";
  private client: MongoClient | undefined;
  private statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS;

  constructor(private readonly target: ConnectionTarget) {}

  private getClient(): MongoClient {
    if (!this.client) {
      throw new Error("MongodbAdapter is not connected. Call connect() first.");
    }
    return this.client;
  }

  async connect(): Promise<void> {
    this.statementTimeoutMs = resolveStatementTimeoutMs();
    this.client = new MongoClient(this.target.raw);
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }

  async ping(): Promise<boolean> {
    const result = await this.getClient().db().command({ ping: 1 });
    return result.ok === 1;
  }

  async getVersion(): Promise<string> {
    const info = await this.getClient().db().admin().serverInfo();
    return `MongoDB ${info.version}`;
  }

  async getOverview(): Promise<DatabaseOverview> {
    const client = this.getClient();
    const { databases } = await client.db().admin().listDatabases({ nameOnly: true });

    const schemas: SchemaMetadata[] = [];
    for (const { name } of databases) {
      if (SYSTEM_DATABASES.has(name)) continue;
      const collections = await client
        .db(name)
        .listCollections(undefined, { nameOnly: true })
        .toArray();
      schemas.push({
        name,
        tables: collections
          .map((collection) => collection.name)
          .filter((name) => !name.startsWith("system."))
      });
    }

    // F063: MongoDB has no read-only SQL query runner (runReadOnlyQuery isn't implemented on this
    // adapter at all - see docs/product-specs/connect-and-inspect-mongodb.md) - apps/web uses this
    // flag instead of an engine === "mongodb" string check to disable the SQL Editor tab and the
    // Files tab's "Run in editor" action.
    return { engine: "mongodb", schemas, capabilities: { supportsSql: false } };
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const collection = this.getClient().db(schema).collection(table);

    // Best-effort field list from a sample, not a full scan - a schemaless collection has no
    // authoritative column list (see the spec's "Concepts that don't map 1:1 from SQL engines").
    const sample = await collection
      .aggregate([{ $sample: { size: FIELD_SAMPLE_SIZE } }], { maxTimeMS: this.statementTimeoutMs })
      .toArray();
    const fieldNames = new Set<string>();
    for (const document of sample) {
      for (const key of Object.keys(document)) fieldNames.add(key);
    }
    // Always report `_id` even if the sample was empty (every document has one) - an empty
    // collection is a valid, expected state (see the spec's "Failure states"), not an error.
    fieldNames.add("_id");

    const columns: ColumnMetadata[] = [...fieldNames].map((name) => ({
      name,
      dataType: "any",
      // Every observed field is nullable - a schemaless collection makes no per-field guarantee
      // (see the spec's "Concepts that don't map 1:1 from SQL engines").
      nullable: true,
      isPrimaryKey: name === "_id",
      isForeignKey: false
    }));

    const rowCount = await collection.estimatedDocumentCount();

    return { schema, name: table, columns, indexes: [], rowCount };
  }

  async getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);

    // MongoDB gives no ordering guarantee between separate find() calls without an explicit sort -
    // skip/limit paging can then show the same document twice or skip one entirely, especially on
    // a collection receiving writes. Sorting by _id (always present, always ordered) makes paging
    // deterministic and repeatable when no caller-requested sort (F065) applies instead.
    const documents = await this.getClient()
      .db(schema)
      .collection(table)
      .find({}, { maxTimeMS: this.statementTimeoutMs })
      .sort(sort ? { [sort.column]: sort.direction === "asc" ? 1 : -1 } : { _id: 1 })
      .skip(offset)
      .limit(safePageSize)
      .toArray();

    // The column set is the union of fields observed on *this page* (not getTable()'s separate
    // sample) - documents in the same collection can have different fields, so a page-level union
    // avoids either blank columns (a field in the table-level sample but absent from this page) or
    // missing ones (common on this page but absent from that sample). See the spec's "Rows =
    // documents" section.
    const fieldNames = new Set<string>();
    for (const document of documents) {
      for (const key of Object.keys(document)) fieldNames.add(key);
    }

    return {
      columns: [...fieldNames],
      rows: documents.map((document) => normalizeDocument(document)),
      page: safePage,
      pageSize: safePageSize
    };
  }

  async runReadOnlyQuery(_sql: string): Promise<RowPage> {
    // MongoDB has no SQL dialect for assertReadOnly's string-scan model or a read-only-transaction
    // backstop to run inside (see the spec's "Why this engine is scoped differently") - there is no
    // query runner for this engine in this pass. The SQL Editor tab is disabled client-side when
    // connected to Mongo (apps/web's App.tsx checks DatabaseOverview.engine), so this should be
    // unreachable in normal use; it throws rather than silently no-opping in case it's ever hit
    // directly (e.g. a stale client, a future regression in that gating).
    throw Object.assign(
      new Error("MongoDB does not support the SQL query runner - browse collections directly."),
      { statusCode: 400 }
    );
  }
}

/** Factory that creates {@link MongodbAdapter} instances for MongoDB targets. */
export const mongodbAdapterFactory: AdapterFactory = {
  engine: "mongodb",
  supports: (target) => target.engine === "mongodb",
  create: (target) => new MongodbAdapter(target)
};
