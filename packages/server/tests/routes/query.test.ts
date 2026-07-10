import type { DatabaseAdapter } from "@qyre/driver-contract";
import { ReadOnlyViolationError, stubReadOnlyCapabilities } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

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
});
