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
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
    await app.close();
  });
});
