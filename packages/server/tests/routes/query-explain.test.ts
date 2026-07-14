import { ReadOnlyViolationError } from "@qyre/driver-contract";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

describe("POST /api/query/explain (F128)", () => {
  it("returns a normalized plan and passes the analyze option to the adapter", async () => {
    const explainQuery = vi.fn(async () => ({
      lines: ["Seq Scan on users"],
      classification: "read" as const,
      analyzed: true
    }));
    const app = createServer({ adapter: makeFakeAdapter({ explainQuery }) });
    const response = await app.inject({
      method: "POST",
      url: "/api/query/explain",
      payload: { sql: "SELECT * FROM users", analyze: true },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lines: ["Seq Scan on users"],
      classification: "read",
      analyzed: true
    });
    expect(explainQuery).toHaveBeenCalledWith("SELECT * FROM users", true);
    await app.close();
  });

  it("remains available in a forced read-only session", async () => {
    const app = createServer({
      adapter: makeFakeAdapter({
        explainQuery: async () => ({ lines: ["plan"], classification: "read", analyzed: false })
      }),
      readOnly: true
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/query/explain",
      payload: { sql: "SELECT 1" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns a clear 400 when the engine has no SQL EXPLAIN surface", async () => {
    const app = createServer({ adapter: makeFakeAdapter({ engine: "mongodb" }) });
    const response = await app.inject({
      method: "POST",
      url: "/api/query/explain",
      payload: { sql: "SELECT 1" },
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "EXPLAIN is not available for this database engine."
    });
    await app.close();
  });

  it("rejects invalid bodies and unsafe ANALYZE requests with 400", async () => {
    const app = createServer({
      adapter: makeFakeAdapter({
        explainQuery: async () => {
          throw new ReadOnlyViolationError("ANALYZE rejected");
        }
      })
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/api/query/explain",
      payload: {},
      headers: authHeaders(app)
    });
    const unsafe = await app.inject({
      method: "POST",
      url: "/api/query/explain",
      payload: { sql: "DELETE FROM users", analyze: true },
      headers: authHeaders(app)
    });
    expect(invalid.statusCode).toBe(400);
    expect(unsafe.statusCode).toBe(400);
    expect(unsafe.json()).toMatchObject({ error: "ANALYZE rejected" });
    await app.close();
  });
});
