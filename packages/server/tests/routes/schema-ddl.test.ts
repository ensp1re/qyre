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

const WIDGETS_INDEXES = [
  { name: "idx_widgets_title", columns: ["title"], unique: true, primary: false }
];

describe("POST /api/tables/:schema/:table/ddl/indexes (F112)", () => {
  it("creates an index and returns 201, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: {
        createIndex: async (schema, table, definition) => {
          received = { schema, table, definition };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "idx_widgets_title2", columns: ["title"], unique: false }
    });

    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      schema: "public",
      table: "widgets",
      definition: { name: "idx_widgets_title2", columns: ["title"], unique: false }
    });
    await app.close();
  });

  it("rejects an unknown column with 400, before calling the adapter", async () => {
    let createIndexCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: {
        createIndex: async () => {
          createIndexCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "idx_denied", columns: ["does_not_exist"], unique: false }
    });

    expect(response.statusCode).toBe(400);
    expect(createIndexCalled).toBe(false);
    await app.close();
  });

  it("rejects an invalid index name with 400 before calling the adapter", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "1; DROP TABLE users;--", columns: ["title"], unique: false }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects creating an index on a view with 400, before calling the adapter (F124)", async () => {
    let createIndexCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "v", kind: "view", columns: [] }),
      ddl: {
        createIndex: async () => {
          createIndexCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/v/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "idx_v", columns: ["title"], unique: false }
    });

    expect(response.statusCode).toBe(400);
    expect(createIndexCalled).toBe(false);
    await app.close();
  });

  it("rejects with 403 when supportsDdl is true but supportsIndexManagement is false", async () => {
    let createIndexCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => ({ ...writableCapabilities(), supportsIndexManagement: false }),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: {
        createIndex: async () => {
          createIndexCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "idx_denied", columns: ["title"], unique: false }
    });

    expect(response.statusCode).toBe(403);
    expect(createIndexCalled).toBe(false);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: { createIndex: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/indexes",
      headers: authHeaders(app),
      payload: { name: "idx_denied", columns: ["title"], unique: false }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("DELETE /api/tables/:schema/:table/ddl/indexes/:indexName (F112)", () => {
  it("drops an index and returns 204, and logs an audit event", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: {
        dropIndex: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/indexes/idx_widgets_title",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(204);
    expect(dropCalled).toBe(true);
    await app.close();
  });

  it("rejects an unknown index with 400, before calling the adapter", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/indexes/does_not_exist",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 403 when supportsDdl is true but supportsIndexManagement is false", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => ({ ...writableCapabilities(), supportsIndexManagement: false }),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: {
        dropIndex: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/indexes/idx_widgets_title",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(403);
    expect(dropCalled).toBe(false);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS,
        indexes: WIDGETS_INDEXES
      }),
      ddl: { dropIndex: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/indexes/idx_widgets_title",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

const WIDGETS_COLUMNS = [
  { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "title", dataType: "text", nullable: true, isPrimaryKey: false, isForeignKey: false }
];

describe("POST /api/tables/:schema/:table/ddl/columns (F111)", () => {
  it("adds a column and returns 201, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        addColumn: async (schema, table, column) => {
          received = { schema, table, column };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/columns",
      headers: authHeaders(app),
      payload: { name: "note", dataType: "text", nullable: true, default: null }
    });

    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      schema: "public",
      table: "widgets",
      column: { name: "note", dataType: "text", nullable: true, default: null }
    });
    await app.close();
  });

  it("rejects an unsupported column type with 400, before calling the adapter", async () => {
    let addColumnCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        addColumn: async () => {
          addColumnCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/widgets/ddl/columns",
      headers: authHeaders(app),
      payload: { name: "note", dataType: "not_a_real_type", nullable: true, default: null }
    });

    expect(response.statusCode).toBe(400);
    expect(addColumnCalled).toBe(false);
    await app.close();
  });

  it("rejects with 400 for MongoDB - collections have no columns to alter", async () => {
    const adapter = makeFakeAdapter({ engine: "mongodb" });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/test/widgets/ddl/columns",
      headers: authHeaders(app),
      payload: { name: "note", dataType: "text", nullable: true, default: null }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects adding a column to a view with 400, before calling the adapter (F124)", async () => {
    let addColumnCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({ schema: "public", name: "v", kind: "view", columns: [] }),
      ddl: {
        addColumn: async () => {
          addColumnCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/v/ddl/columns",
      headers: authHeaders(app),
      payload: { name: "note", dataType: "text", nullable: true, default: null }
    });

    expect(response.statusCode).toBe(400);
    expect(addColumnCalled).toBe(false);
    await app.close();
  });
});

describe("PATCH /api/tables/:schema/:table/ddl/columns/:column (F111)", () => {
  it("renames a column and returns 200, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        renameColumn: async (schema, table, column, newName) => {
          received = { schema, table, column, newName };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { newName: "heading" }
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      schema: "public",
      table: "widgets",
      column: "title",
      newName: "heading"
    });
    await app.close();
  });

  it("alters a column and returns 200, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        alterColumn: async (schema, table, column, changes) => {
          received = { schema, table, column, changes };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { changes: { nullable: false } }
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      schema: "public",
      table: "widgets",
      column: "title",
      changes: { nullable: false }
    });
    await app.close();
  });

  it("renames and alters in one request, alter applied to the new name", async () => {
    const calls: unknown[] = [];
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        renameColumn: async (schema, table, column, newName) => {
          calls.push({ op: "rename", schema, table, column, newName });
        },
        alterColumn: async (schema, table, column, changes) => {
          calls.push({ op: "alter", schema, table, column, changes });
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { newName: "heading", changes: { nullable: false } }
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      { op: "rename", schema: "public", table: "widgets", column: "title", newName: "heading" },
      {
        op: "alter",
        schema: "public",
        table: "widgets",
        column: "heading",
        changes: { nullable: false }
      }
    ]);
    await app.close();
  });

  it("rejects an unknown column with 400, before calling the adapter", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/does_not_exist",
      headers: authHeaders(app),
      payload: { newName: "heading" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a body with neither newName nor changes with 400", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 400 for MongoDB - collections have no columns to alter", async () => {
    const adapter = makeFakeAdapter({ engine: "mongodb" });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/test/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { newName: "heading" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: { renameColumn: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { newName: "heading" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("DELETE /api/tables/:schema/:table/ddl/columns/:column (F111)", () => {
  it("drops a column when confirmedName matches, and returns 204", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        dropColumn: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { confirmedName: "title" }
    });

    expect(response.statusCode).toBe(204);
    expect(dropCalled).toBe(true);
    await app.close();
  });

  it("rejects a mismatched confirmedName with 400, before calling the adapter", async () => {
    let dropCalled = false;
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: {
        dropColumn: async () => {
          dropCalled = true;
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { confirmedName: "not-title" }
    });

    expect(response.statusCode).toBe(400);
    expect(dropCalled).toBe(false);
    await app.close();
  });

  it("rejects an unknown column with 400, before calling the adapter", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/columns/does_not_exist",
      headers: authHeaders(app),
      payload: { confirmedName: "does_not_exist" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 400 for MongoDB - collections have no columns to alter", async () => {
    const adapter = makeFakeAdapter({ engine: "mongodb" });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/test/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { confirmedName: "title" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects with 403 in a --read-only session, even with full grants (F096)", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => writableCapabilities(),
      getTable: async () => ({
        schema: "public",
        name: "widgets",
        kind: "table",
        columns: WIDGETS_COLUMNS
      }),
      ddl: { dropColumn: async () => {} }
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/widgets/ddl/columns/title",
      headers: authHeaders(app),
      payload: { confirmedName: "title" }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
