/** MongoDB adapter composition and lifecycle. */
import type {
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata
} from "@qyre/core";
import { resolvePageRequest, stubReadOnlyCapabilities } from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import { MongoClient } from "mongodb";
import { normalizeDocument } from "./bson-values.js";
import { buildMongoFilter } from "./filters.js";
import { introspectCollection, introspectSchemas } from "./introspection.js";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
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
    return {
      engine: "mongodb",
      schemas: await introspectSchemas(this.getClient()),
      capabilities: await this.getCapabilities()
    };
  }

  async getCapabilities(): Promise<ConnectionCapabilities> {
    return stubReadOnlyCapabilities(false);
  }

  async getTable(schema: string, table: string): Promise<TableMetadata> {
    return introspectCollection(this.getClient(), schema, table, this.statementTimeoutMs);
  }

  /** MongoDB field sampling is inherently per collection, so keep concurrency bounded to one. */
  async getAllTables(): Promise<TableMetadata[]> {
    const overview = await this.getOverview();
    const result: TableMetadata[] = [];
    for (const schema of overview.schemas) {
      for (const table of schema.tables) {
        result.push(await this.getTable(schema.name, table));
      }
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
