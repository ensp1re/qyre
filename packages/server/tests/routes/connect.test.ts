import type { AdapterFactory } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("Database switching (F064)", () => {
  it("returns 404 when adapterFactories is not configured", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/db" }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("switches to the new adapter and disconnects the old one only after the new one is live", async () => {
    let oldDisconnected = false;
    const oldAdapter = makeFakeAdapter({ disconnect: async () => void (oldDisconnected = true) });
    const newAdapter = makeFakeAdapter({
      getVersion: async () => "PostgreSQL 17.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [{ name: "public", tables: ["new_table"] }],
        capabilities: { supportsSql: true }
      })
    });
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: (candidateTarget) => candidateTarget.engine === "postgres",
      create: () => newAdapter
    };

    const app = createServer({
      adapter: oldAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const connectResponse = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/new" }
    });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json()).toEqual({
      target: "postgres://user:***@localhost:5432/new"
    });
    expect(oldDisconnected).toBe(true);

    const overviewResponse = await app.inject({ method: "GET", url: "/api/overview" });
    expect(overviewResponse.json()).toMatchObject({
      schemas: [{ name: "public", tables: ["new_table"] }]
    });

    const healthResponse = await app.inject({ method: "GET", url: "/api/health" });
    expect(healthResponse.json()).toMatchObject({
      database: "connected",
      target: "postgres://user:***@localhost:5432/new",
      engineVersion: "PostgreSQL 17.0"
    });
    await app.close();
  });

  it("leaves the old connection fully working when the new target fails to connect", async () => {
    const oldAdapter = makeFakeAdapter();
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: (candidateTarget) => candidateTarget.engine === "postgres",
      create: () =>
        makeFakeAdapter({
          connect: async () => {
            throw new Error("connection refused");
          }
        })
    };

    const app = createServer({
      adapter: oldAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const connectResponse = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/unreachable" }
    });
    expect(connectResponse.statusCode).toBe(400);
    expect(connectResponse.json()).toMatchObject({ error: "connection refused" });

    // The old adapter is still the one serving requests - a failed switch never left a gap.
    const healthResponse = await app.inject({ method: "GET", url: "/api/health" });
    expect(healthResponse.json()).toMatchObject({
      database: "connected",
      target: "postgres://user:***@localhost:5432/old"
    });
    await app.close();
  });

  it("surfaces the real reason from an AggregateError, not an empty message (F064 live-caught bug)", async () => {
    // A connection failure to an unreachable host commonly throws Node's AggregateError (it
    // tries IPv6 then IPv4 and wraps both failures) - confirmed live against a real unreachable
    // port: its own .message is "", with the actual reason only in .errors[0]. Reproduced here
    // without a real network call so the regression is covered without depending on timing.
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () =>
        makeFakeAdapter({
          connect: async () => {
            throw new AggregateError(
              [
                new Error("connect ECONNREFUSED ::1:59999"),
                new Error("connect ECONNREFUSED 127.0.0.1:59999")
              ],
              ""
            );
          }
        })
    };
    const app = createServer({ adapterFactories: [factory] });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:59999/unreachable" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "connect ECONNREFUSED ::1:59999" });
    await app.close();
  });

  it("rejects a target no configured factory supports", async () => {
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => false,
      create: () => makeFakeAdapter()
    };
    const app = createServer({ adapterFactories: [factory] });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/db" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.any(String) });
    await app.close();
  });

  it("rejects an invalid request body with 400", async () => {
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () => makeFakeAdapter()
    };
    const app = createServer({ adapterFactories: [factory] });

    const response = await app.inject({ method: "POST", url: "/api/connect", payload: {} });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
