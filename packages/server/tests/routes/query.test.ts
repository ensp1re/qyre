import type { ConnectionCapabilities } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import {
  assertReadOnly,
  OperationCancelledError,
  ReadOnlyViolationError,
  stubReadOnlyCapabilities
} from "@qyre/driver-contract";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

const WRITABLE_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: true,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: true,
  supportsDatabaseManagement: true,
  supportsTransactions: true,
  readOnlyReason: null
};

function writeCapableAdapter(runQueryImpl: DatabaseAdapter["runQuery"]): {
  adapter: DatabaseAdapter;
  runQuery: ReturnType<typeof vi.fn>;
} {
  const runQuery = vi.fn(runQueryImpl);
  const adapter: DatabaseAdapter = {
    engine: "postgres",
    connect: async () => {},
    disconnect: async () => {},
    ping: async () => true,
    getVersion: async () => "PostgreSQL 16.0",
    getCapabilities: async () => WRITABLE_CAPABILITIES,
    getOverview: async () => ({
      engine: "postgres",
      schemas: [],
      capabilities: WRITABLE_CAPABILITIES
    }),
    getTable: async () => ({ schema: "public", name: "x", columns: [] }),
    getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
    // Apply the same read-only gate as real adapters.
    runReadOnlyQuery: async (sql) => {
      assertReadOnly(sql);
      return { columns: [], rows: [], page: 0, pageSize: 0 };
    },
    runQuery
  };
  return { adapter, runQuery };
}

describe("POST /api/query", () => {
  it("rejects an invalid query body with 400", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: {},
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns the real error message (not a generic one) when a query fails for a reason other than a read-only violation", async () => {
    // Preserve the driver's message for errors other than read-only violations.
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => {
        throw new Error('relation "orders_items" does not exist');
      }
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT * FROM orders_items" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: 'relation "orders_items" does not exist' });
    await app.close();
  });

  it("returns 400 (not 500) when the adapter rejects a read-only-violating query", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => {
        throw new ReadOnlyViolationError("Only read-only statements are allowed.");
      }
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "DELETE FROM users" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Only read-only statements are allowed.",
      reason: "read-only"
    });
    await app.close();
  });

  it("passes operationId through to runReadOnlyQuery and reports a cancellation as 499 (F126)", async () => {
    let receivedOperationId: string | undefined;
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async (_sql, operationId) => {
        receivedOperationId = operationId;
        throw new OperationCancelledError();
      }
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT * FROM users", operationId: "op-1" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(499);
    expect(response.json()).toMatchObject({ cancelled: true });
    expect(receivedOperationId).toBe("op-1");
    await app.close();
  });

  describe("write-capable sessions (F107, F108)", () => {
    it("still routes a read-classified statement through runReadOnlyQuery, not runQuery, tagged with classification: read", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 0
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "SELECT * FROM users" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ classification: "read" });
      expect(runQuery).not.toHaveBeenCalled();
      await app.close();
    });

    it("runs a mutation statement directly via runQuery", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 1
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "UPDATE users SET name = 'x' WHERE id = 1" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        columns: [],
        rows: [],
        rowsAffected: 1,
        classification: "mutation"
      });
      expect(runQuery).toHaveBeenCalledWith("UPDATE users SET name = 'x' WHERE id = 1", undefined);
      await app.close();
    });

    it("runs a ddl statement directly via runQuery", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 0
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "CREATE TABLE t (id int)" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ classification: "ddl" });
      expect(runQuery).toHaveBeenCalledWith("CREATE TABLE t (id int)", undefined);
      await app.close();
    });

    it("rejects an unconfirmed destructive statement with 409 and never calls runQuery", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 0
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "DROP TABLE users" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ classification: "destructive" });
      expect(runQuery).not.toHaveBeenCalled();
      await app.close();
    });

    it("runs a confirmed destructive statement via runQuery", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 5
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "DROP TABLE users", confirmed: true },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        columns: [],
        rows: [],
        rowsAffected: 5,
        classification: "destructive"
      });
      expect(runQuery).toHaveBeenCalledWith("DROP TABLE users", undefined);
      await app.close();
    });

    it("passes operationId through to runQuery and reports a cancellation as 499 (F126)", async () => {
      let receivedOperationId: string | undefined;
      const { adapter } = writeCapableAdapter(async (_sql, operationId) => {
        receivedOperationId = operationId;
        throw new OperationCancelledError();
      });
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "UPDATE users SET name = 'x' WHERE id = 1", operationId: "op-2" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(499);
      expect(response.json()).toMatchObject({ cancelled: true });
      expect(receivedOperationId).toBe("op-2");
      await app.close();
    });

    it("calls runQuery bound to the adapter instance, not detached (regression: a real adapter's runQuery relies on `this`, unlike the arrow-function fakes above)", async () => {
      // A class method catches accidental loss of the adapter's this binding.
      class ClassBasedAdapter implements DatabaseAdapter {
        engine = "postgres";
        ranWith: string | undefined;
        async connect() {}
        async disconnect() {}
        async ping() {
          return true;
        }
        async getVersion() {
          return "PostgreSQL 16.0";
        }
        async getCapabilities(): Promise<ConnectionCapabilities> {
          return WRITABLE_CAPABILITIES;
        }
        async getOverview() {
          return { engine: "postgres" as const, schemas: [], capabilities: WRITABLE_CAPABILITIES };
        }
        async getTable() {
          return { schema: "public", name: "x", columns: [] };
        }
        async getRows() {
          return { columns: [], rows: [], page: 0, pageSize: 0 };
        }
        async runReadOnlyQuery(sql: string) {
          assertReadOnly(sql);
          return { columns: [], rows: [], page: 0, pageSize: 0 };
        }
        async runQuery(sql: string) {
          this.ranWith = sql;
          return { columns: [], rows: [], rowsAffected: 1 };
        }
      }
      const adapter = new ClassBasedAdapter();
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "UPDATE users SET name = 'x' WHERE id = 1" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(200);
      expect(adapter.ranWith).toBe("UPDATE users SET name = 'x' WHERE id = 1");
      await app.close();
    });

    it("still enforces the --read-only flag over a write-capable adapter (F096 always wins)", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 1
      }));
      const app = createServer({ adapter, readOnly: true });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "UPDATE users SET name = 'x' WHERE id = 1" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(400);
      expect(runQuery).not.toHaveBeenCalled();
      await app.close();
    });

    it("returns 400 on an unconfirmed empty/multiple-statement query without ever reaching runQuery", async () => {
      const { adapter, runQuery } = writeCapableAdapter(async () => ({
        columns: [],
        rows: [],
        rowsAffected: 0
      }));
      const app = createServer({ adapter });
      const response = await app.inject({
        method: "POST",
        url: "/api/query",
        payload: { sql: "UPDATE users SET name='a'; DROP TABLE users" },
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(400);
      expect(runQuery).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
