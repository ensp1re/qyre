import type { ConnectionCapabilities } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import {
  assertReadOnly,
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

/** A minimal write-capable fake adapter (F107) - `getCapabilities` reports full write access and
 * `runQuery` is a spy so tests can assert it was (or wasn't) called for a given statement. */
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
    // Mirrors every real adapter's runReadOnlyQuery: rejects anything assertReadOnly rejects, so
    // the "read-only always wins for non-read statements" behavior is genuinely exercised here,
    // not just assumed.
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
    // F017: found while testing F012 - a bad table name (or any non-ReadOnlyViolationError query
    // failure) used to fall through to Fastify's default error handler, which returns
    // { statusCode, error: "Internal Server Error", message: "<real detail>" } - apps/web's
    // fetchJson reads `error`, so the developer saw the useless reason phrase instead of the real
    // reason their query failed. The global error handler must fix this for any adapter, not just
    // Postgres specifically.
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
    expect(response.json()).toMatchObject({ error: "Only read-only statements are allowed." });
    await app.close();
  });

  describe("write-capable sessions (F107)", () => {
    it("still routes a read-classified statement through runReadOnlyQuery, not runQuery", async () => {
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
      expect(response.json()).toEqual({ columns: [], rows: [], rowsAffected: 1 });
      expect(runQuery).toHaveBeenCalledWith("UPDATE users SET name = 'x' WHERE id = 1");
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
      expect(runQuery).toHaveBeenCalledWith("CREATE TABLE t (id int)");
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
      expect(response.json()).toEqual({ columns: [], rows: [], rowsAffected: 5 });
      expect(runQuery).toHaveBeenCalledWith("DROP TABLE users");
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
