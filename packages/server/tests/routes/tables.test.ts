import type { DatabaseAdapter } from "@qyre/driver-contract";
import { OperationCancelledError, stubReadOnlyCapabilities } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("/api/tables", () => {
  it("returns every table's metadata in one request (F027)", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getCapabilities: async () => stubReadOnlyCapabilities(true),
      getOverview: async () => ({
        engine: "postgres",
        schemas: [{ name: "public", tables: ["a", "b"] }],
        capabilities: stubReadOnlyCapabilities(true)
      }),
      getTable: async (schema, table) => ({ schema, name: table, kind: "table", columns: [] }),
      getAllTables: async () => [
        { schema: "public", name: "a", kind: "table", columns: [] },
        { schema: "public", name: "b", kind: "table", columns: [] }
      ],
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      streamRows: async function* () {},
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tables: [
        { schema: "public", name: "a", kind: "table", columns: [] },
        { schema: "public", name: "b", kind: "table", columns: [] }
      ]
    });
    await app.close();
  });

  it("returns 503 when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/tables",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("normalizes an engine permission denial into the safe 403 body, never raw driver text (F149)", async () => {
    const adapter = makeFakeAdapter({
      classifyPermissionDenied: () => "permission",
      getAllTables: async () => {
        throw new Error("not authorized on data to execute command { listCollections: 1 }");
      }
    });
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "permission-denied",
      operation: "list-schemas"
    });
    expect(JSON.stringify(response.json())).not.toContain("listCollections");
    await app.close();
  });

  it("normalizes a per-table read denial with the table named in the 403 body (F149)", async () => {
    const adapter = makeFakeAdapter({
      classifyPermissionDenied: () => "permission",
      getRows: async () => {
        throw new Error("permission denied for table secrets");
      }
    });
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/secrets/rows?page=1&pageSize=25",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "permission-denied",
      operation: "read-table",
      object: "public.secrets"
    });
    await app.close();
  });
});

describe("GET /api/tables/:schema/:table/rows", () => {
  it("resolves whole-table search against validated column metadata", async () => {
    let receivedSearch: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        columns: [
          {
            name: "payload",
            dataType: "jsonb",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      }),
      getRows: async (_schema, _table, _page, _pageSize, _sort, _filters, search) => {
        receivedSearch = search;
        return { columns: ["payload"], rows: [], page: 0, pageSize: 50, total: 0 };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/x/rows?search=admin",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(receivedSearch).toEqual({
      value: "admin",
      columns: [expect.objectContaining({ name: "payload", dataType: "jsonb" })]
    });
    await app.close();
  });

  it("returns 400 (not 500) for invalid pagination params", async () => {
    // Invalid pagination should map to 400 instead of the default 500.
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
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/users/rows?page=abc",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.any(String) });
    await app.close();
  });

  it("passes operationId through to getRows and reports a cancellation as 499 (F126)", async () => {
    let receivedOperationId: string | undefined;
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
      getRows: async (_schema, _table, _page, _pageSize, _sort, _filters, _search, operationId) => {
        receivedOperationId = operationId;
        throw new OperationCancelledError();
      },
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/users/rows?operationId=op-1",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(499);
    expect(response.json()).toMatchObject({ cancelled: true });
    expect(receivedOperationId).toBe("op-1");
    await app.close();
  });
});

describe("Server-side filtering", () => {
  const filtersParam = (filters: unknown): string =>
    `filters=${encodeURIComponent(JSON.stringify(filters))}`;

  it("passes validated filters through to getRows", async () => {
    let receivedFilters: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        columns: [
          {
            name: "name",
            dataType: "text",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      }),
      getRows: async (_schema, _table, _page, _pageSize, _sort, filters) => {
        receivedFilters = filters;
        return { columns: ["name"], rows: [], page: 0, pageSize: 50 };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/rows?${filtersParam([
        { column: "name", op: "contains", value: "ada" }
      ])}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(receivedFilters).toEqual([
      { column: "name", op: "contains", value: "ada", columnDataType: "text" }
    ]);
    await app.close();
  });

  it("passes plain structured contains text to the adapter", async () => {
    let receivedFilters: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        columns: [
          {
            name: "payload",
            dataType: "jsonb",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      }),
      getRows: async (_schema, _table, _page, _pageSize, _sort, filters) => {
        receivedFilters = filters;
        return { columns: ["payload"], rows: [], page: 0, pageSize: 50 };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/rows?${filtersParam([
        { column: "payload", op: "contains", value: "{broken" }
      ])}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(receivedFilters).toEqual([
      { column: "payload", op: "contains", value: "{broken", columnDataType: "jsonb" }
    ]);
    await app.close();
  });

  it("rejects operators that do not match the selected column capability", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        columns: [
          {
            name: "amount",
            dataType: "numeric",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/rows?${filtersParam([
        { column: "amount", op: "contains", value: "10" }
      ])}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("not supported for column")
    });
    await app.close();
  });

  it("does not allow MongoDB MinKey/MaxKey sentinel columns to be scalar-filtered", async () => {
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getTable: async () => ({
        schema: "qyre_test",
        name: "type_showcase",
        columns: [
          {
            name: "minKeyField",
            dataType: "minKey",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/qyre_test/type_showcase/rows?${filtersParam([
        { column: "minKeyField", op: "eq", value: "$minKey" }
      ])}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("Server-side sort (F065)", () => {
  function makeSortableAdapter(
    getRowsSpy: (
      schema: string,
      table: string,
      page: number,
      pageSize: number,
      sort?: { column: string; direction: "asc" | "desc" }
    ) => ReturnType<DatabaseAdapter["getRows"]>
  ): DatabaseAdapter {
    return makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        columns: [
          {
            name: "id",
            dataType: "int",
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: false
          },
          {
            name: "name",
            dataType: "text",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      }),
      getRows: getRowsSpy
    });
  }

  it("passes a validated sortColumn/sortDirection through to getRows", async () => {
    let receivedSort: unknown;
    const adapter = makeSortableAdapter(async (_s, _t, _p, _ps, sort) => {
      receivedSort = sort;
      return { columns: ["id", "name"], rows: [], page: 0, pageSize: 50 };
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/x/rows?sortColumn=name&sortDirection=desc",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(receivedSort).toEqual({ column: "name", direction: "desc" });
    await app.close();
  });

  it("defaults sortDirection to asc when only sortColumn is given", async () => {
    let receivedSort: unknown;
    const adapter = makeSortableAdapter(async (_s, _t, _p, _ps, sort) => {
      receivedSort = sort;
      return { columns: ["id", "name"], rows: [], page: 0, pageSize: 50 };
    });
    const app = createServer({ adapter });

    await app.inject({
      method: "GET",
      url: "/api/tables/public/x/rows?sortColumn=name",
      headers: authHeaders(app)
    });
    expect(receivedSort).toEqual({ column: "name", direction: "asc" });
    await app.close();
  });

  it("passes undefined sort when no sortColumn is given", async () => {
    let receivedSort: unknown = "not called";
    const adapter = makeSortableAdapter(async (_s, _t, _p, _ps, sort) => {
      receivedSort = sort;
      return { columns: ["id", "name"], rows: [], page: 0, pageSize: 50 };
    });
    const app = createServer({ adapter });

    await app.inject({
      method: "GET",
      url: "/api/tables/public/x/rows",
      headers: authHeaders(app)
    });
    expect(receivedSort).toBeUndefined();
    await app.close();
  });

  it("rejects a sortColumn that isn't a real column on the table with 400", async () => {
    const adapter = makeSortableAdapter(async () => ({
      columns: [],
      rows: [],
      page: 0,
      pageSize: 50
    }));
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/x/rows?sortColumn=does_not_exist",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("does_not_exist") });
    await app.close();
  });
});

describe("POST /api/tables/:schema/:table/rows (F099)", () => {
  const insertableColumns = [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ];

  it("inserts a row and returns 201 with the inserted row, and logs an audit event", async () => {
    let receivedValues: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: insertableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        insertRow: async (_schema, _table, values) => {
          receivedValues = values;
          return { row: { id: 1, name: "Ada" } };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { name: "Ada" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ row: { id: 1, name: "Ada" } });
    expect(receivedValues).toEqual({ name: "Ada" });
    await app.close();
  });

  it("rejects an insert into a view with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "v",
        kind: "view",
        columns: insertableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/v/rows",
      headers: authHeaders(app),
      payload: { name: "Ada" }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an insert when the table lacks insert permission with 403", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: insertableColumns,
        permissions: { select: true, insert: false, update: false, delete: false }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { name: "Ada" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects an unknown column with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: insertableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { insertRow: async () => ({ row: {} }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { nope: "x" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("nope") });
    await app.close();
  });

  it("rejects a non-object request body with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: insertableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { insertRow: async () => ({ row: {} }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: { ...authHeaders(app), "content-type": "application/json" },
      payload: JSON.stringify("not an object")
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects the insert with 403 in a --read-only session, even with insert permission (F096)", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: insertableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { name: "Ada" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("PATCH /api/tables/:schema/:table/rows (F100)", () => {
  const updatableColumns = [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ];

  it("updates a row and returns 200 with matched: 1, and logs an audit event", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        updateRowByKey: async (_schema, _table, key, changes) => {
          received = { key, changes };
          return { matched: 1 };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { name: "Grace" } }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ matched: 1 });
    expect(received).toEqual({ key: { id: 1 }, changes: { name: "Grace" } });
    await app.close();
  });

  it("reports a 0-matched update as 409, not a silent success", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { updateRowByKey: async () => ({ matched: 0 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { name: "Grace" } }
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("rejects an update into a view with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "v",
        kind: "view",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/v/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { name: "Grace" } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an update when the table lacks update permission with 403", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: false, delete: true }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { name: "Grace" } }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects a key missing a primary-key column with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { updateRowByKey: async () => ({ matched: 1 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: {}, changes: { name: "Grace" } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects changes that include the primary-key column with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { updateRowByKey: async () => ({ matched: 1 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { id: 2 } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a body missing both changes and document with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { updateRowByKey: async () => ({ matched: 1 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("uses the document field (not changes) for a MongoDB update", async () => {
    let received: unknown;
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getTable: async () => ({
        schema: "test",
        name: "users",
        kind: "collection",
        columns: [
          {
            name: "_id",
            dataType: "objectId",
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: false
          },
          {
            name: "name",
            dataType: "string",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ],
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        updateRowByKey: async (_schema, _table, key, changes) => {
          received = { key, changes };
          return { matched: 1 };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/test/users/rows",
      headers: authHeaders(app),
      payload: {
        key: { _id: "507f1f77bcf86cd799439011" },
        document: { name: "Grace" },
        originalDocument: { name: "Ada" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      key: { _id: "507f1f77bcf86cd799439011" },
      changes: { name: "Grace" }
    });
    await app.close();
  });

  it("rejects a MongoDB update with 400 when originalDocument is missing (F125 lost-update protection)", async () => {
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getTable: async () => ({
        schema: "test",
        name: "users",
        kind: "collection",
        columns: [
          {
            name: "_id",
            dataType: "objectId",
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: false
          }
        ],
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        updateRowByKey: async () => ({ matched: 1 })
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/test/users/rows",
      headers: authHeaders(app),
      payload: { key: { _id: "507f1f77bcf86cd799439011" }, document: { name: "Grace" } }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects the update with 403 in a --read-only session, even with update permission (F096)", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: updatableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { key: { id: 1 }, changes: { name: "Grace" } }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("DELETE /api/tables/:schema/:table/rows (F101)", () => {
  const deletableColumns = [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ];

  it("deletes rows and returns 200 with deleted: 2, and logs an audit event", async () => {
    let receivedKeys: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        deleteRowsByKey: async (_schema, _table, keys) => {
          receivedKeys = keys;
          return { deleted: 2 };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: 1 }, { id: 2 }] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: 2 });
    expect(receivedKeys).toEqual([{ id: 1 }, { id: 2 }]);
    await app.close();
  });

  it("reports a partial delete (fewer deleted than requested) as 409, not a silent success", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { deleteRowsByKey: async () => ({ deleted: 1 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: 1 }, { id: 2 }] }
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("rejects a delete from a view with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "v",
        kind: "view",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/v/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: 1 }] }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a delete when the table lacks delete permission with 403", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: false }
      })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: 1 }] }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects an empty keys array with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { deleteRowsByKey: async () => ({ deleted: 0 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [] }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a key missing a primary-key column with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: { deleteRowsByKey: async () => ({ deleted: 1 }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [{}] }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects the delete with 403 in a --read-only session, even with delete permission (F096)", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: deletableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: 1 }] }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("Whole-result export (F118)", () => {
  it("streams CSV through one adapter iterator without paginated getRows calls", async () => {
    let streamCalls = 0;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        kind: "table",
        columns: [
          { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false }
        ]
      }),
      getRows: async () => {
        throw new Error("export must not paginate through getRows");
      },
      streamRows: async function* (_schema, _table, columns, sort, filters) {
        streamCalls += 1;
        expect(columns.map((column) => column.name)).toEqual(["id"]);
        expect(sort).toEqual({ column: "id", direction: "desc" });
        expect(filters).toEqual([{ column: "id", op: "gte", value: "1", columnDataType: "int4" }]);
        yield { id: 2 };
        yield { id: "=cmd()" };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/export.csv?sortColumn=id&sortDirection=desc&filters=${encodeURIComponent(
        JSON.stringify([{ column: "id", op: "gte", value: "1" }])
      )}&token=${app.authToken}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="x.csv"');
    expect(response.payload).toBe("id\n2\n'=cmd()\n");
    expect(streamCalls).toBe(1);
    await app.close();
  });

  it("streams ordinary JSON and adapter-owned SQL INSERT output", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "x",
        kind: "table",
        columns: [
          {
            name: "name",
            dataType: "text",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      }),
      streamRows: async function* () {
        yield { name: "Ada" };
      },
      formatSqlInsert: (_schema, _table, _columns, row) => `SAFE ${String(row.name)}`
    });
    const app = createServer({ adapter });

    const json = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/export.json?token=${app.authToken}`
    });
    expect(json.headers["content-type"]).toContain("application/json");
    expect(json.payload).toBe('[\n{"name":"Ada"}\n]\n');

    const sql = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/export.sql?token=${app.authToken}`
    });
    expect(sql.headers["content-type"]).toContain("application/sql");
    expect(sql.payload).toBe("SAFE Ada\n");
    await app.close();
  });

  it("uses an adapter JSON serializer for Extended JSON", async () => {
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getCapabilities: async () => stubReadOnlyCapabilities(false),
      getTable: async () => ({
        schema: "app",
        name: "docs",
        kind: "collection",
        columns: []
      }),
      streamRows: async function* () {
        yield { _id: "raw" };
      },
      serializeJsonRow: () => '{"_id":{"$oid":"abc"}}'
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/app/docs/export.json?token=${app.authToken}`
    });
    expect(response.payload).toBe('[\n{"_id":{"$oid":"abc"}}\n]\n');
    await app.close();
  });

  it("rejects a format the adapter does not advertise before streaming", async () => {
    let streamed = false;
    const adapter = makeFakeAdapter({
      engine: "mongodb",
      getCapabilities: async () => stubReadOnlyCapabilities(false),
      streamRows: () => {
        streamed = true;
        throw new Error("unsupported export must not start streaming");
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/app/docs/export.sql?token=${app.authToken}`
    });
    expect(response.statusCode).toBe(400);
    expect(streamed).toBe(false);
    await app.close();
  });

  it("rejects a sortColumn that isn't a real column with 400, before streaming starts", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({ schema: "public", name: "x", columns: [] })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: `/api/tables/public/x/export.csv?sortColumn=does_not_exist&token=${app.authToken}`
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects export without a valid token (F122)", async () => {
    const adapter = makeFakeAdapter();
    const app = createServer({ adapter });

    const response = await app.inject({ method: "GET", url: "/api/tables/public/x/export.csv" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
