import type { DatabaseAdapter } from "@qyre/driver-contract";
import { stubReadOnlyCapabilities } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

describe("GET /api/health", () => {
  it("responds with status ok and unconfigured database", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      database: "unconfigured",
      engineVersion: null,
      pingLatencyMs: null,
      lastError: null
    });
    await app.close();
  });

  it("reports a ping latency once connected (F042)", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.4",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
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
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    const body = response.json();
    expect(body.database).toBe("connected");
    expect(typeof body.pingLatencyMs).toBe("number");
    expect(body.pingLatencyMs).toBeGreaterThanOrEqual(0);
    expect(body.lastError).toBeNull();
    await app.close();
  });

  it("reports the ping failure's error message, and clears it once a later ping succeeds (F042)", async () => {
    let shouldFail = true;
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => {
        if (shouldFail) throw new Error("Connection terminated unexpectedly");
        return true;
      },
      getVersion: async () => "PostgreSQL 16.4",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
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

    const failedResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(failedResponse.json()).toMatchObject({
      database: "disconnected",
      lastError: "Connection terminated unexpectedly"
    });

    shouldFail = false;
    const recoveredResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(recoveredResponse.json()).toMatchObject({ database: "connected", lastError: null });
    await app.close();
  });

  it("reports the adapter's engine version when connected", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.4",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
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
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(response.json()).toMatchObject({
      database: "connected",
      engineVersion: "PostgreSQL 16.4"
    });
    await app.close();
  });

  it("reports a null engine version when the adapter is disconnected", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => false,
      getVersion: async () => "PostgreSQL 16.4",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
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
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(response.json()).toMatchObject({ database: "disconnected", engineVersion: null });
    await app.close();
  });
});
