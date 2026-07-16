/** MongoDB adapter composition and lifecycle. */
import type {
  ColumnMetadata,
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
  OperationCancelledError,
  resolvePageRequest,
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
import { MongoClient } from "mongodb";
import { dropDatabase, listDatabases } from "../admin/admin.js";
import { inspectAccess } from "../access/access.js";
import { normalizeDocument } from "./bson-values.js";
import { isMongoCancelError, registerMongoCancellation } from "./cancellation.js";
import {
  createIndex,
  createTable,
  dropIndex,
  dropTable,
  renameTable,
  truncateTable
} from "../schema/ddl.js";
import { buildMongoFilter } from "../query/filters.js";
import { introspectCollection, introspectSchemas } from "../schema/introspection.js";
import {
  deleteRowsByKey,
  getDocumentText,
  insertRow,
  updateFieldsByKey,
  updateRowByKey
} from "../write/mutations.js";
import { classifyMongodbPermissionDenied } from "../access/permission-errors.js";
import type { ConnectionStatusResult } from "../access/permissions.js";
import {
  fetchConnectionCapabilities,
  fetchConnectionStatus,
  fetchTablePermissions,
  READ_ONLY_TABLE_PERMISSIONS,
  tablePermissionsFromConnectionStatus
} from "../access/permissions.js";
import { serializeJsonRow, streamRows } from "../query/row-export.js";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

export class MongodbAdapter implements DatabaseAdapter {
  public readonly engine = "mongodb";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  public operationRegistry?: CancellationRegistry;
  public readonly mutations: RowMutationApi = {
    insertRow: (schema, table, values) => insertRow(this.getClient(), schema, table, values),
    updateRowByKey: (schema, table, key, changes, expectedOriginal) =>
      updateRowByKey(this.getClient(), schema, table, key, changes, expectedOriginal),
    updateFieldsByKey: (schema, table, key, changes, originalValues, missingOriginalFields) =>
      updateFieldsByKey(
        this.getClient(),
        schema,
        table,
        key,
        changes,
        originalValues,
        missingOriginalFields
      ),
    deleteRowsByKey: (schema, table, keys) =>
      deleteRowsByKey(this.getClient(), schema, table, keys),
    getDocumentText: (schema, table, id) => getDocumentText(this.getClient(), schema, table, id)
  };
  public readonly ddl: SchemaDdlApi = {
    createTable: (schema, table, columns) => createTable(this.getClient(), schema, table, columns),
    renameTable: (schema, table, newName) => renameTable(this.getClient(), schema, table, newName),
    truncateTable: (schema, table) => truncateTable(this.getClient(), schema, table),
    dropTable: (schema, table) => dropTable(this.getClient(), schema, table),
    createIndex: (schema, table, definition) =>
      createIndex(this.getClient(), schema, table, definition),
    dropIndex: (schema, table, indexName) => dropIndex(this.getClient(), schema, table, indexName)
  };
  /** No `createDatabase` - MongoDB databases come into existence implicitly on first write; see
   * admin.ts's doc comment. */
  public readonly admin: DatabaseAdminApi = {
    inspectAccess: () => inspectAccess(this.getClient()),
    listDatabases: () => listDatabases(this.getClient()),
    dropDatabase: (name) => dropDatabase(this.getClient(), name)
  };
  private client: MongoClient | undefined;
  private statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS;

  constructor(private readonly target: ConnectionTarget) {}

  private getClient(): MongoClient {
    if (!this.client) {
      throw new Error("MongodbAdapter is not connected. Call connect() first.");
    }
    return this.client;
  }

  async *streamRows(
    schema: string,
    table: string,
    columns: readonly ColumnMetadata[],
    sort?: RowSort,
    filters?: RowFilter[]
  ): AsyncIterable<Record<string, unknown>> {
    const filter = buildMongoFilter(filters, columns);
    yield* streamRows(this.getClient(), schema, table, filter, this.statementTimeoutMs, sort);
  }

  serializeJsonRow(row: Record<string, unknown>): string {
    return serializeJsonRow(row);
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
    return {
      engine: "mongodb",
      schemas: await introspectSchemas(this.getClient()),
      capabilities: await this.getCapabilities()
    };
  }

  private reportPermissionIntrospectionFailure(error: unknown): void {
    const detail = error instanceof Error ? error.message : "unknown error";
    const message = `MongoDB permission introspection failed; reporting read-only permissions: ${detail}`;
    if (this.onConnectionEvent) this.onConnectionEvent("warn", message);
    else console.warn(message);
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    try {
      return await fetchConnectionCapabilities(this.getClient());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return { ...stubReadOnlyCapabilities(false), supportsAccessInspection: true };
    }
  }

  classifyPermissionDenied = classifyMongodbPermissionDenied;

  private async getTablePermissions(schema: string, table: string): Promise<TablePermissions> {
    try {
      return await fetchTablePermissions(this.getClient(), schema, table);
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return READ_ONLY_TABLE_PERMISSIONS;
    }
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    const [metadata, permissions] = await Promise.all([
      introspectCollection(this.getClient(), schema, table, this.statementTimeoutMs),
      this.getTablePermissions(schema, table)
    ]);
    return { ...metadata, permissions };
  }

  /**
   * MongoDB field sampling is inherently per collection, so keep concurrency bounded to one.
   * Permissions (F095) are read from one shared `connectionStatus` call, not refetched per
   * collection - the same privilege document determines every collection's permissions, unlike
   * the per-collection field sample each still needs its own round trip for.
   */
  async getAllTables(): Promise<TableMetadata[]> {
    const overview = await this.getOverview();
    const status = await this.fetchConnectionStatusOrDegrade();
    const result: TableMetadata[] = [];
    for (const schema of overview.schemas) {
      for (const table of schema.tables) {
        const metadata = await introspectCollection(
          this.getClient(),
          schema.name,
          table,
          this.statementTimeoutMs
        );
        const permissions = status
          ? tablePermissionsFromConnectionStatus(status, schema.name, table)
          : READ_ONLY_TABLE_PERMISSIONS;
        result.push({ ...metadata, permissions });
      }
    }
    return result;
  }

  private async fetchConnectionStatusOrDegrade(): Promise<ConnectionStatusResult | undefined> {
    try {
      return await fetchConnectionStatus(this.getClient());
    } catch (error) {
      this.reportPermissionIntrospectionFailure(error);
      return undefined;
    }
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
    const columns =
      filters && filters.length > 0 ? (await this.getTable(schema, table)).columns : [];
    const filterDocument = buildMongoFilter(filters, columns);
    registerMongoCancellation(this.getClient(), this.operationRegistry, operationId, schema);
    try {
      const documents = await this.getClient()
        .db(schema)
        .collection(table)
        .find(filterDocument, {
          maxTimeMS: this.statementTimeoutMs,
          ...(operationId ? { comment: operationId } : {})
        })
        .sort(sort ? { [sort.column]: sort.direction === "asc" ? 1 : -1 } : { _id: 1 })
        .skip(offset)
        .limit(safePageSize)
        .toArray();

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
    } catch (error) {
      if (isMongoCancelError(error)) throw new OperationCancelledError();
      throw error;
    } finally {
      if (operationId) this.operationRegistry?.unregister(operationId);
    }
  }

  async runReadOnlyQuery(_sql: string): Promise<RowPage> {
    throw Object.assign(
      new Error("MongoDB does not support the SQL query runner - browse collections directly."),
      { statusCode: 400 }
    );
  }
}

export const mongodbAdapterFactory: AdapterFactory = {
  engine: "mongodb",
  supports: (target) => target.engine === "mongodb",
  create: (target) => new MongodbAdapter(target)
};
