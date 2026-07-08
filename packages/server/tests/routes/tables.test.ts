import type { DatabaseAdapter } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("/api/tables", () => {
  it("returns every table's metadata in one request (F027)", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [{ name: "public", tables: ["a", "b"] }],
        capabilities: { supportsSql: true }
      }),
      getTable: async (schema, table) => ({ schema, name: table, columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({ method: "GET", url: "/api/tables" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tables: [
        { schema: "public", name: "a", columns: [] },
        { schema: "public", name: "b", columns: [] }
      ]
    });
    await app.close();
  });

  it("returns 503 when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/tables" });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});

describe("GET /api/tables/:schema/:table/rows", () => {
  it("returns 400 (not 500) for invalid pagination params", async () => {
    // F022: rowsQuerySchema.parse() used to throw straight into Fastify's default handler on bad
    // input, returning 500 with a raw stringified Zod issue dump - /api/query's safeParse pattern
    // is the correct precedent.
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
    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/users/rows?page=abc"
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.any(String) });
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
      url: "/api/tables/public/x/rows?sortColumn=name&sortDirection=desc"
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

    await app.inject({ method: "GET", url: "/api/tables/public/x/rows?sortColumn=name" });
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

    await app.inject({ method: "GET", url: "/api/tables/public/x/rows" });
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
      url: "/api/tables/public/x/rows?sortColumn=does_not_exist"
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("does_not_exist") });
    await app.close();
  });
});

describe("Whole-table CSV export (F066)", () => {
  it("streams a header line plus every row across multiple batches", async () => {
    let callCount = 0;
    const adapter = makeFakeAdapter({
      getRows: async (_schema, _table, page, pageSize) => {
        callCount += 1;
        // The first batch comes back exactly full (pageSize rows) so the endpoint's loop knows
        // to fetch another page; the second comes back short, signaling the real end of the
        // table - proves the streaming loop paginates instead of assuming one batch is everything.
        if (page === 0) {
          return {
            columns: ["id"],
            rows: Array.from({ length: pageSize }, (_, i) => ({ id: i })),
            page: 0,
            pageSize
          };
        }
        return { columns: ["id"], rows: [{ id: "last" }], page, pageSize };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({ method: "GET", url: "/api/tables/public/x/export.csv" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="x.csv"');

    const lines = response.payload.trim().split("\n");
    expect(lines[0]).toBe("id");
    expect(lines).toHaveLength(1 + 200 + 1); // header + full first batch + the short second batch
    expect(lines.at(-1)).toBe("last");
    expect(callCount).toBe(2);
    await app.close();
  });

  it("applies the same formula-injection escaping as the page-only export (F035)", async () => {
    const adapter = makeFakeAdapter({
      getRows: async (_schema, _table, page) => {
        if (page > 0) return { columns: ["formula"], rows: [], page, pageSize: 200 };
        return {
          columns: ["formula"],
          rows: [{ formula: "=cmd()" }],
          page: 0,
          pageSize: 200
        };
      }
    });
    const app = createServer({ adapter });

    const response = await app.inject({ method: "GET", url: "/api/tables/public/x/export.csv" });
    const lines = response.payload.trim().split("\n");
    expect(lines).toEqual(["formula", "'=cmd()"]);
    await app.close();
  });

  it("rejects a sortColumn that isn't a real column with 400, before streaming starts", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({ schema: "public", name: "x", columns: [] })
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/x/export.csv?sortColumn=does_not_exist"
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
