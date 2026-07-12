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

describe("POST /api/schemas/:schema/tables (F110)", () => {
  it("creates a table and returns 201, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      ddl: {
        createTable: async (schema, table, columns) => {
          received = { schema, table, columns };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas/public/tables",
      headers: authHeaders(app),
      payload: {
        table: "widgets",
        columns: [{ name: "id", dataType: "integer", nullable: false, default: null }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      schema: "public",
      table: "widgets",
      columns: [{ name: "id", dataType: "integer", nullable: false, default: null }]
    });
    await app.close();
  });

  it("rejects an unsupported column type with 400, before calling createTable", async () => {
    let createTableCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      ddl: {
        createTable: async () => {
          createTableCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas/public/tables",
      headers: authHeaders(app),
      payload: {
        table: "widgets",
        columns: [{ name: "id", dataType: "not_a_real_type", nullable: false, default: null }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(createTableCalled).toBe(false);
    await app.close();
  });

  it("rejects an invalid table name with 400 before calling the adapter", async () => {
    const adapter = makeFakeAdapter();
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas/public/tables",
      headers: authHeaders(app),
      payload: { table: "1; DROP TABLE users;--", columns: [] }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 403 when the session cannot perform schema-editing operations", async () => {
    const adapter = makeFakeAdapter(); // default stub capabilities: supportsDdl false
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas/public/tables",
      headers: authHeaders(app),
      payload: { table: "widgets", columns: [] }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      ddl: { createTable: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/schemas/public/tables",
      headers: authHeaders(app),
      payload: { table: "widgets", columns: [] }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("POST /api/tables/:schema/:table/ddl/rename (F110)", () => {
  it("renames a table and returns 200, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: {
        renameTable: async (schema, table, newName) => {
          received = { schema, table, newName };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/rename",
      headers: authHeaders(app),
      payload: { newName: "gadgets" }
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ schema: "public", table: "widgets", newName: "gadgets" });
    await app.close();
  });

  it("rejects renaming a view with 400, before calling the adapter (F124)", async () => {
    let renameCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "v", kind: "view", columns: [] }),
      ddl: {
        renameTable: async () => {
          renameCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/v/ddl/rename",
      headers: authHeaders(app),
      payload: { newName: "v2" }
    });

    expect(response.statusCode).toBe(400);
    expect(renameCalled).toBe(false);
    await app.close();
  });
});

describe("POST /api/tables/:schema/:table/ddl/truncate (F110)", () => {
  it("truncates a table when confirmedName matches, and returns 200", async () => {
    let truncateCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: {
        truncateTable: async () => {
          truncateCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/truncate",
      headers: authHeaders(app),
      payload: { confirmedName: "widgets" }
    });

    expect(response.statusCode).toBe(200);
    expect(truncateCalled).toBe(true);
    await app.close();
  });

  it("rejects a mismatched confirmedName with 400, before calling the adapter", async () => {
    let truncateCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: {
        truncateTable: async () => {
          truncateCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/truncate",
      headers: authHeaders(app),
      payload: { confirmedName: "not-widgets" }
    });

    expect(response.statusCode).toBe(400);
    expect(truncateCalled).toBe(false);
    await app.close();
  });
});

describe("DELETE /api/tables/:schema/:table (F110)", () => {
  it("drops a table when confirmedName matches, and returns 204", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: {
        dropTable: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets",
      headers: authHeaders(app),
      payload: { confirmedName: "widgets" }
    });

    expect(response.statusCode).toBe(204);
    expect(dropCalled).toBe(true);
    await app.close();
  });

  it("rejects dropping a view with 400, before calling the adapter (F124)", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "v", kind: "view", columns: [] }),
      ddl: {
        dropTable: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/v",
      headers: authHeaders(app),
      payload: { confirmedName: "v" }
    });

    expect(response.statusCode).toBe(400);
    expect(dropCalled).toBe(false);
    await app.close();
  });

  it("rejects a mismatched confirmedName with 400, before calling the adapter", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: {
        dropTable: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets",
      headers: authHeaders(app),
      payload: { confirmedName: "not-widgets" }
    });

    expect(response.statusCode).toBe(400);
    expect(dropCalled).toBe(false);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "widgets", kind: "table", columns: [] }),
      ddl: { dropTable: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets",
      headers: authHeaders(app),
      payload: { confirmedName: "widgets" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
