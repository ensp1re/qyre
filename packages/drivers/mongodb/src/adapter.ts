/** MongoDB adapter composition and lifecycle. */
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
import { resolvePageRequest, stubReadOnlyCapabilities } from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter, RowMutationApi } from "@qyre/driver-contract";
import { MongoClient } from "mongodb";
import { normalizeDocument } from "./bson-values.js";
import { buildMongoFilter } from "./filters.js";
import { introspectCollection, introspectSchemas } from "./introspection.js";
import { insertRow } from "./mutations.js";
import type { ConnectionStatusResult } from "./permissions.js";
import {
  fetchConnectionCapabilities,
  fetchConnectionStatus,
  fetchTablePermissions,
  READ_ONLY_TABLE_PERMISSIONS,
  tablePermissionsFromConnectionStatus
} from "./permissions.js";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

export class MongodbAdapter implements DatabaseAdapter {
  public readonly engine = "mongodb";
  public onConnectionEvent?: DatabaseAdapter["onConnectionEvent"];
  public readonly mutations: RowMutationApi = {
    insertRow: (schema, table, values) => insertRow(this.getClient(), schema, table, values)
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
      return stubReadOnlyCapabilities(false);
    }
  }

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
    filters?: RowFilter[]
  ): Promise<RowPage> {
    const { page: safePage, pageSize: safePageSize, offset } = resolvePageRequest(page, pageSize);
    const columns =
      filters && filters.length > 0 ? (await this.getTable(schema, table)).columns : [];
    const filterDocument = buildMongoFilter(filters, columns);
    const documents = await this.getClient()
      .db(schema)
      .collection(table)
      .find(filterDocument, { maxTimeMS: this.statementTimeoutMs })
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
