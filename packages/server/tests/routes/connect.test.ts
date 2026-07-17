import type { AdapterFactory } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("Database switching (F064)", () => {
  it("returns 404 when adapterFactories is not configured", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/db" },
      headers: authHeaders(app)
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
      payload: { target: "postgres://user:pass@localhost:5432/new" },
      headers: authHeaders(app)
    });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json()).toEqual({
      target: "postgres://user:***@localhost:5432/new"
    });
    expect(oldDisconnected).toBe(true);

    const overviewResponse = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: authHeaders(app)
    });
    expect(overviewResponse.json()).toMatchObject({
      schemas: [{ name: "public", tables: ["new_table"] }]
    });

    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
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
      payload: { target: "postgres://user:pass@localhost:5432/unreachable" },
      headers: authHeaders(app)
    });
    expect(connectResponse.statusCode).toBe(400);
    expect(connectResponse.json()).toMatchObject({ error: "connection refused" });

    // The old adapter is still the one serving requests - a failed switch never left a gap.
    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(healthResponse.json()).toMatchObject({
      database: "connected",
      target: "postgres://user:***@localhost:5432/old"
    });
    await app.close();
  });

  it("rejects credentials that authenticate but cannot browse, keeping the old connection (F149)", async () => {
    let newDisconnected = false;
    const oldAdapter = makeFakeAdapter();
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () =>
        makeFakeAdapter({
          disconnect: async () => void (newDisconnected = true),
          classifyPermissionDenied: () => "permission",
          getOverview: async () => {
            throw new Error("not authorized on data to execute command { listCollections: 1 }");
          }
        })
    };
    const app = createServer({
      adapter: oldAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/scoped" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("not authorized to browse the database");
    expect(response.json().error).not.toContain("listCollections");
    expect(newDisconnected).toBe(true);

    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(healthResponse.json()).toMatchObject({
      database: "connected",
      target: "postgres://user:***@localhost:5432/old"
    });
    await app.close();
  });

  it("rejects the connect when the browse preflight fails for a non-permission reason (F149)", async () => {
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () =>
        makeFakeAdapter({
          getOverview: async () => {
            throw new Error("catalog query timed out");
          }
        })
    };
    const app = createServer({ adapterFactories: [factory] });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: { target: "postgres://user:pass@localhost:5432/slow" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "catalog query timed out" });
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
      payload: { target: "postgres://user:pass@localhost:59999/unreachable" },
      headers: authHeaders(app)
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
      payload: { target: "postgres://user:pass@localhost:5432/db" },
      headers: authHeaders(app)
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

    const response = await app.inject({
      method: "POST",
      url: "/api/connect",
      payload: {},
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/connect/database (F116)", () => {
  it("switches to a sibling database using the current target's own credentials", async () => {
    let requestedRaw: string | undefined;
    const oldAdapter = makeFakeAdapter();
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: (target) => {
        requestedRaw = target.raw;
        return makeFakeAdapter({ getVersion: async () => "PostgreSQL 17.0" });
      }
    };
    const app = createServer({
      adapter: oldAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: { database: "sibling" },
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ target: "postgres://user:***@localhost:5432/sibling" });
    expect(requestedRaw).toBe("postgres://user:pass@localhost:5432/sibling");
    await app.close();
  });

  it("percent-encodes a database name with special characters", async () => {
    let requestedRaw: string | undefined;
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: (target) => {
        requestedRaw = target.raw;
        return makeFakeAdapter();
      }
    };
    const app = createServer({
      adapter: makeFakeAdapter(),
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: { database: "my db" },
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(requestedRaw).toBe("postgres://user:pass@localhost:5432/my%20db");
    await app.close();
  });

  it("returns 400 when not connected to anything yet", async () => {
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () => makeFakeAdapter()
    };
    const app = createServer({ adapterFactories: [factory] }); // no `target`

    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: { database: "sibling" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when adapterFactories is not configured", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: { database: "sibling" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("rejects an invalid request body with 400", async () => {
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () => makeFakeAdapter()
    };
    const app = createServer({
      adapter: makeFakeAdapter(),
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: {},
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("leaves the old connection fully working when the sibling database fails to connect", async () => {
    const oldAdapter = makeFakeAdapter();
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: () => true,
      create: () =>
        makeFakeAdapter({
          connect: async () => {
            throw new Error("database does not exist");
          }
        })
    };
    const app = createServer({
      adapter: oldAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/connect/database",
      payload: { database: "missing" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "database does not exist" });

    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(healthResponse.json()).toMatchObject({
      database: "connected",
      target: "postgres://user:***@localhost:5432/old"
    });
    await app.close();
  });
});
