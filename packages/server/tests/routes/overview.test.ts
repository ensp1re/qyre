import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";

describe("GET /api/overview", () => {
  it("returns 503 when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/overview" });
    expect(response.statusCode).toBe(503);
    // F017: the global error handler must surface the real message under `error`, not Fastify's
    // default { statusCode, error: "Service Unavailable", message: "..." } shape (which the
    // frontend would misread as the reason phrase, not the actual detail).
    expect(response.json()).toMatchObject({ error: "No database connection is configured." });
    await app.close();
  });
});
