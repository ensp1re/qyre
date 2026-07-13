import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("GET /api/overview", () => {
  it("returns 503 when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(503);
    // F017: the global error handler must surface the real message under `error`, not Fastify's
    // default { statusCode, error: "Service Unavailable", message: "..." } shape (which the
    // frontend would misread as the reason phrase, not the actual detail).
    expect(response.json()).toMatchObject({ error: "No database connection is configured." });
    await app.close();
  });

  it("includes a well-formed ConnectionCapabilities object (F091)", async () => {
    const app = createServer({ adapter: makeFakeAdapter() });
    const response = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().capabilities).toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: false,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
    await app.close();
  });

  it("--read-only forces every capability false with readOnlyReason 'qyre-flag', even when the connected role would otherwise be fully writable (F096)", async () => {
    const writableAdapter = makeFakeAdapter({
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: {
          supportsSql: true,
          supportsRowMutations: true,
          supportsDdl: true,
          supportsIndexManagement: true,
          supportsDatabaseManagement: true,
          supportsTransactions: true,
          readOnlyReason: null
        }
      })
    });
    const app = createServer({ adapter: writableAdapter, readOnly: true });
    const response = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().capabilities).toEqual({
      supportsSql: true,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "qyre-flag"
    });
    await app.close();
  });

  it("--read-only survives a POST /api/connect adapter swap (F096)", async () => {
    const writableAdapter = makeFakeAdapter({
      getOverview: async () => ({
        engine: "postgres",
        schemas: [],
        capabilities: {
          supportsSql: true,
          supportsRowMutations: true,
          supportsDdl: true,
          supportsIndexManagement: true,
          supportsDatabaseManagement: true,
          supportsTransactions: true,
          readOnlyReason: null
        }
      })
    });
    const app = createServer({
      adapter: makeFakeAdapter(),
      readOnly: true,
      adapterFactories: [
        {
          engine: "postgres",
          supports: () => true,
          create: () => writableAdapter
        }
      ]
    });

    const connectResponse = await app.inject({
      method: "POST",
      url: "/api/connect",
      headers: authHeaders(app),
      payload: { target: "postgres://localhost/anything" }
    });
    expect(connectResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: authHeaders(app)
    });
    expect(response.json().capabilities).toMatchObject({
      supportsRowMutations: false,
      readOnlyReason: "qyre-flag"
    });
    await app.close();
  });
});
