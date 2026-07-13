import type { ConnectionCapabilities } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { createServer, EventLog } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

const WRITABLE_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: true,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: true,
  supportsDatabaseManagement: true,
  supportsTransactions: true,
  readOnlyReason: null
};

function deniedError(): Error {
  return Object.assign(new Error("raw engine permission text must stay private"), {
    code: "42501"
  });
}

function deniedAdapter() {
  return makeFakeAdapter({
    classifyPermissionDenied: (error) =>
      (error as { code?: string }).code === "42501" ? "permission" : undefined,
    getCapabilities: async () => WRITABLE_CAPABILITIES,
    getTable: async (schema, table) => ({
      schema,
      name: table,
      kind: "table",
      columns: [
        {
          name: "name",
          dataType: "text",
          nullable: false,
          isPrimaryKey: false,
          isForeignKey: false
        }
      ],
      permissions: { select: true, insert: true, update: true, delete: true }
    }),
    mutations: { insertRow: async () => Promise.reject(deniedError()) },
    ddl: { createTable: async () => Promise.reject(deniedError()) },
    admin: {
      createDatabase: async () => Promise.reject(deniedError()),
      listDatabases: async () => []
    },
    runQuery: async () => Promise.reject(deniedError())
  });
}

describe("permission-denied error mapping (F120)", () => {
  it("rejects registration of a mutating route without denial metadata", async () => {
    const app = createServer();
    expect(() =>
      app.post("/api/__unsafe-mutation", { config: { mutating: true } }, async () => ({ ok: true }))
    ).toThrow("lacks permission-denial metadata");
    await app.close();
  });

  it("returns a structured row denial without raw engine text and logs it once", async () => {
    const eventLog = new EventLog();
    const app = createServer({ adapter: deniedAdapter(), eventLog });
    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: { name: "Ada" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error:
        "Permission denied while attempting to insert on public.users. The connected role likely needs INSERT.",
      code: "permission-denied",
      operation: "insert",
      object: "public.users",
      likelyMissingGrant: "INSERT"
    });
    expect(response.body).not.toContain("raw engine permission text");
    expect(eventLog.list()).toEqual([
      expect.objectContaining({
        level: "warn",
        message: "insert denied on public.users; likely missing INSERT."
      })
    ]);
    await app.close();
  });

  it("maps an advisory permission pre-check to the same contract so the browser refreshes", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        schema: "public",
        name: "users",
        kind: "table",
        columns: [],
        permissions: { select: true, insert: false, update: false, delete: false }
      })
    });
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/rows",
      headers: authHeaders(app),
      payload: {}
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "permission-denied",
      operation: "insert",
      object: "public.users",
      likelyMissingGrant: "INSERT"
    });
    await app.close();
  });

  it.each([
    {
      name: "DDL",
      method: "POST" as const,
      url: "/api/schemas/public/tables",
      payload: {
        table: "widgets",
        columns: [{ name: "id", dataType: "integer", nullable: false, default: null }]
      },
      expected: {
        operation: "create-table",
        object: "public.widgets",
        likelyMissingGrant: "CREATE"
      }
    },
    {
      name: "database administration",
      method: "POST" as const,
      url: "/api/databases",
      payload: { database: "analytics" },
      expected: {
        operation: "create-database",
        object: "analytics",
        likelyMissingGrant: "CREATE DATABASE"
      }
    },
    {
      name: "write-capable SQL execution",
      method: "POST" as const,
      url: "/api/query",
      payload: { sql: "UPDATE users SET name = 'Grace' WHERE name = 'Ada'" },
      expected: {
        operation: "execute-query",
        object: "the current database",
        likelyMissingGrant: "the privilege required by this SQL statement"
      }
    }
  ])("maps $name through the same safe contract", async ({ method, url, payload, expected }) => {
    const app = createServer({ adapter: deniedAdapter() });
    const response = await app.inject({ method, url, payload, headers: authHeaders(app) });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "permission-denied", ...expected });
    expect(response.body).not.toContain("raw engine permission text");
    await app.close();
  });
});
