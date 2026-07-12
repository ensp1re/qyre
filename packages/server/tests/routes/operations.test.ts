import type { DatabaseAdapter } from "@qyre/driver-contract";
import { OperationCancelledError, stubReadOnlyCapabilities } from "@qyre/driver-contract";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

describe("POST /api/operations/:id/cancel", () => {
  it("returns cancelled: false for an unknown operation id", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/operations/unknown-id/cancel",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cancelled: false });
    await app.close();
  });

  it("works in a --read-only session, since cancelling isn't itself a mutation", async () => {
    const app = createServer({ readOnly: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/operations/unknown-id/cancel",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cancelled: false });
    await app.close();
  });

  it("cancels a running query end-to-end: createServer assigns its operationRegistry onto the connected adapter, the adapter registers a callback, and cancel triggers it (F126)", async () => {
    let registered = false;
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
      // createServer assigns ctx.operationRegistry onto this adapter at construction time (the same
      // "server assigns a hook after connect()" pattern onConnectionEvent already uses), so
      // this.operationRegistry is already live by the time a request comes in.
      runReadOnlyQuery: (_sql, operationId) =>
        new Promise((_resolve, reject) => {
          adapter.operationRegistry?.register(operationId ?? "", async () => {
            reject(new OperationCancelledError());
          });
          registered = true;
        })
    };
    const app = createServer({ adapter });

    const queryPromise = app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT 1", operationId: "op-e2e" },
      headers: authHeaders(app)
    });

    await vi.waitFor(() => {
      if (!registered) throw new Error("cancel callback not registered yet");
    });

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/api/operations/op-e2e/cancel",
      headers: authHeaders(app)
    });
    expect(cancelResponse.json()).toEqual({ cancelled: true });

    const queryResponse = await queryPromise;
    expect(queryResponse.statusCode).toBe(499);
    expect(queryResponse.json()).toMatchObject({ cancelled: true });
    await app.close();
  });
});
