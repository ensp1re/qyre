import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("POST /api/mutations/commit (F102)", () => {
  const mutableColumns = [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ];

  it("commits a mixed batch and returns 200 with results, and logs an audit event", async () => {
    let receivedOps: unknown;
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: mutableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        commitBatch: async (ops) => {
          receivedOps = ops;
          return {
            committed: true,
            results: [{ row: { id: 3, name: "Ada" } }, { matched: 1 }, { deleted: 1 }]
          };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [
          { type: "insert", schema: "public", table: "users", values: { name: "Ada" } },
          {
            type: "update",
            schema: "public",
            table: "users",
            key: { id: 1 },
            changes: { name: "Grace" }
          },
          { type: "delete", schema: "public", table: "users", keys: [{ id: 2 }] }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      committed: true,
      results: [{ row: { id: 3, name: "Ada" } }, { matched: 1 }, { deleted: 1 }]
    });
    expect(receivedOps).toEqual([
      { type: "insert", schema: "public", table: "users", values: { name: "Ada" } },
      {
        type: "update",
        schema: "public",
        table: "users",
        key: { id: 1 },
        changes: { name: "Grace" }
      },
      { type: "delete", schema: "public", table: "users", keys: [{ id: 2 }] }
    ]);
    await app.close();
  });

  it("reports a rolled-back commit as 409 with the failing op index, not a silent success", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: mutableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        commitBatch: async () => ({ committed: false, failedIndex: 1 })
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [
          { type: "insert", schema: "public", table: "users", values: { name: "Ada" } },
          {
            type: "update",
            schema: "public",
            table: "users",
            key: { id: 1 },
            changes: { name: "X" }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ failedIndex: 1 });
    await app.close();
  });

  it("rejects with 400 for MongoDB - batch commit doesn't apply there", async () => {
    const adapter = makeFakeAdapter({ engine: "mongodb" });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: { ops: [{ type: "insert", schema: "test", table: "users", values: {} }] }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an empty ops array with 400", async () => {
    const adapter = makeFakeAdapter();
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: { ops: [] }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a body missing ops with 400", async () => {
    const adapter = makeFakeAdapter();
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects the whole batch with 400 if any op targets a view, before calling commitBatch", async () => {
    let commitBatchCalled = false;
    const adapter = makeFakeAdapter({
      getTable: async (_schema, table) => ({
        schema: "public",
        name: table,
        kind: table === "v" ? "view" : "table",
        columns: mutableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      }),
      mutations: {
        commitBatch: async () => {
          commitBatchCalled = true;
          return { committed: true, results: [] };
        }
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [
          { type: "insert", schema: "public", table: "users", values: { name: "Ada" } },
          { type: "insert", schema: "public", table: "v", values: { name: "Bad" } }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(commitBatchCalled).toBe(false);
    await app.close();
  });

  it("rejects an op lacking the specific permission with 403", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: mutableColumns,
        permissions: { select: true, insert: false, update: true, delete: true }
      }),
      mutations: { commitBatch: async () => ({ committed: true, results: [] }) }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [{ type: "insert", schema: "public", table: "users", values: { name: "Ada" } }]
      }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects the commit with 403 in a --read-only session, even with mutation permissions (F096)", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: mutableColumns,
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const app = createServer({ adapter, readOnly: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [{ type: "insert", schema: "public", table: "users", values: { name: "Ada" } }]
      }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("introspects the target table once for a whole batch, not once per op (F135)", async () => {
    const getTable = vi.fn(async () => ({
      schema: "public",
      name: "users",
      kind: "table" as const,
      columns: mutableColumns,
      permissions: { select: true, insert: true, update: true, delete: true }
    }));
    const adapter = makeFakeAdapter({
      getTable,
      mutations: {
        commitBatch: async () => ({
          committed: true,
          results: [{ row: {} }, { matched: 1 }, { deleted: 1 }]
        })
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "POST",
      url: "/api/mutations/commit",
      headers: authHeaders(app),
      payload: {
        ops: [
          { type: "insert", schema: "public", table: "users", values: { name: "Ada" } },
          {
            type: "update",
            schema: "public",
            table: "users",
            key: { id: 1 },
            changes: { name: "Grace" }
          },
          { type: "delete", schema: "public", table: "users", keys: [{ id: 2 }] }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(getTable).toHaveBeenCalledTimes(1);
    expect(getTable).toHaveBeenCalledWith("public", "users");
    await app.close();
  });
});
