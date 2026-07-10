import type { DatabaseAdapter } from "@qyre/driver-contract";
import { ReadOnlyViolationError } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer, EventLog } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

describe("/api/console", () => {
  it("reads console events through a shared EventLog instance passed in (F028)", async () => {
    // Proves createServer's `eventLog` option is actually honored, not just accepted - startServer
    // passes the same instance back to the caller (e.g. the CLI, to wire an adapter's
    // onConnectionEvent into it) and expects GET /api/console to reflect anything logged into it.
    const eventLog = new EventLog();
    const app = createServer({ eventLog });
    eventLog.log("error", "Postgres pool error (connection dropped): test");

    const response = await app.inject({
      method: "GET",
      url: "/api/console",
      headers: authHeaders(app)
    });
    expect(response.json()).toMatchObject({
      events: [
        expect.objectContaining({ level: "error", message: expect.stringContaining("test") })
      ]
    });
    await app.close();
  });

  it("starts with an empty event log", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/console",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ events: [] });
    await app.close();
  });

  it("logs a query success event", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({
        columns: ["id"],
        rows: [{ id: 1 }],
        page: 0,
        pageSize: 1
      })
    };
    const app = createServer({ adapter });
    await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT 1" },
      headers: authHeaders(app)
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/console",
      headers: authHeaders(app)
    });
    const { events } = response.json();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: "info" });
    expect(events[0].message).toMatch(/1 rows returned/);
    await app.close();
  });

  it("logs a query rejection as a warn event", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
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
    await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "DELETE FROM t" },
      headers: authHeaders(app)
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/console",
      headers: authHeaders(app)
    });
    const { events } = response.json();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: "warn" });
    await app.close();
  });

  it("logs a connection-status transition but not the first observation", async () => {
    let connected = true;
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => connected,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const headers = authHeaders(app);

    await app.inject({ method: "GET", url: "/api/health", headers });
    expect(
      (await app.inject({ method: "GET", url: "/api/console", headers })).json().events
    ).toEqual([]);

    connected = false;
    await app.inject({ method: "GET", url: "/api/health", headers });
    const { events } = (await app.inject({ method: "GET", url: "/api/console", headers })).json();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: "warn", message: "Database connection lost." });
    await app.close();
  });

  it("clears the event log", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: { supportsSql: true }
      }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const headers = authHeaders(app);
    await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT 1" },
      headers
    });

    const clearResponse = await app.inject({ method: "DELETE", url: "/api/console", headers });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json()).toEqual({ events: [] });

    const response = await app.inject({ method: "GET", url: "/api/console", headers });
    expect(response.json()).toEqual({ events: [] });
    await app.close();
  });
});
