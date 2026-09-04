import type { ConnectionCapabilities } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

function writableCapabilities(): ConnectionCapabilities {
  return {
    supportsSql: true,
    supportsRowMutations: true,
    supportsDdl: true,
    supportsIndexManagement: true,
    supportsDatabaseManagement: true,
    supportsTransactions: true,
    readOnlyReason: null
  };
}

describe("GET /api/databases (F115)", () => {
  it("lists the connected server's databases", async () => {
    const adapter = makeFakeAdapter({
      admin: { listDatabases: async () => ["app", "qyre_test"] }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/databases",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ databases: ["app", "qyre_test"] });
    await app.close();
  });

  it("responds 400 with a clean message when the engine has no database list (SQLite)", async () => {
    const adapter = makeFakeAdapter({ engine: "sqlite" }); // no admin namespace at all
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/databases",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("one database per connection");
    await app.close();
  });
});

describe("POST /api/databases (F115)", () => {
  it("creates a database and returns 201", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        createDatabase: async (name) => {
          received = name;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/databases",
      headers: authHeaders(app),
      payload: { database: "new_db" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ database: "new_db" });
    expect(received).toBe("new_db");
    await app.close();
  });

  it("rejects an invalid database name with 400 before calling the adapter", async () => {
    let called = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        createDatabase: async () => {
          called = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/databases",
      headers: authHeaders(app),
      payload: { database: "bad name; DROP DATABASE x" }
    });

    expect(response.statusCode).toBe(400);
    expect(called).toBe(false);
    await app.close();
  });

  it("responds 400 with the implicit-creation message on MongoDB", async () => {
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getCapabilities: async () => writableCapabilities(),
      admin: { listDatabases: async () => [], dropDatabase: async () => {} }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/databases",
      headers: authHeaders(app),
      payload: { database: "new_db" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("implicitly");
    await app.close();
  });

  it("rejects with 403 when the session cannot manage databases", async () => {
    const adapter = makeFakeAdapter({
      admin: { createDatabase: async () => {} }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/databases",
      headers: authHeaders(app),
      payload: { database: "new_db" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: { createDatabase: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/databases",
      headers: authHeaders(app),
      payload: { database: "new_db" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("DELETE /api/databases/:database (F115)", () => {
  it("drops a database once confirmedName matches, returning 204", async () => {
    let dropped: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        listDatabases: async () => ["app", "old_db"],
        dropDatabase: async (name) => {
          dropped = name;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/databases/old_db",
      headers: authHeaders(app),
      payload: { confirmedName: "old_db" }
    });

    expect(response.statusCode).toBe(204);
    expect(dropped).toBe("old_db");
    await app.close();
  });

  it("rejects a confirmedName mismatch with 400, before calling the adapter", async () => {
    let called = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        listDatabases: async () => ["old_db"],
        dropDatabase: async () => {
          called = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/databases/old_db",
      headers: authHeaders(app),
      payload: { confirmedName: "wrong" }
    });

    expect(response.statusCode).toBe(400);
    expect(called).toBe(false);
    await app.close();
  });

  it("responds 404 for a database that doesn't exist", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: { listDatabases: async () => ["app"], dropDatabase: async () => {} }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/databases/missing",
      headers: authHeaders(app),
      payload: { confirmedName: "missing" }
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("rejects with 403 when the session cannot manage databases", async () => {
    const adapter = makeFakeAdapter({
      admin: { listDatabases: async () => ["old_db"], dropDatabase: async () => {} }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/databases/old_db",
      headers: authHeaders(app),
      payload: { confirmedName: "old_db" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("POST /api/schemas and DELETE /api/schemas/:schema (F115, Postgres only)", () => {
  it("creates a schema and returns 201", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        createSchema: async (name) => {
          received = name;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas",
      headers: authHeaders(app),
      payload: { schema: "analytics" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ schema: "analytics" });
    expect(received).toBe("analytics");
    await app.close();
  });

  it("responds 400 when the engine has no schema concept (MySQL)", async () => {
    const adapter = makeFakeAdapter({
      engine: "mysql",
      getCapabilities: async () => writableCapabilities(),
      admin: { listDatabases: async () => [], createDatabase: async () => {} }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas",
      headers: authHeaders(app),
      payload: { schema: "analytics" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("drops a schema via typed confirmation, returning 204 - no exists-first 404, since an empty schema never appears in getOverview", async () => {
    let dropped: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        dropSchema: async (name) => {
          dropped = name;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/schemas/analytics",
      headers: authHeaders(app),
      payload: { confirmedName: "analytics" }
    });

    expect(response.statusCode).toBe(204);
    expect(dropped).toBe("analytics");
    await app.close();
  });

  it("rejects a confirmedName mismatch with 400, before calling the adapter", async () => {
    let called = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      admin: {
        dropSchema: async () => {
          called = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/schemas/analytics",
      headers: authHeaders(app),
      payload: { confirmedName: "wrong" }
    });

    expect(response.statusCode).toBe(400);
    expect(called).toBe(false);
    await app.close();
  });
});
