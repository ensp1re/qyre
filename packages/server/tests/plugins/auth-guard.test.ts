import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";

describe("auth guard (F122)", () => {
  it("rejects an /api request with no token", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "Unauthorized: missing or invalid session token."
    });
    await app.close();
  });

  it("rejects an /api request with the wrong token", async () => {
    const app = createServer({ authToken: "correct-token" });
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: "Bearer wrong-token" }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts an /api request with a valid Authorization: Bearer header", async () => {
    const app = createServer({ authToken: "correct-token" });
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: "Bearer correct-token" }
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("accepts an /api request with a valid ?token= query param (plain-navigation downloads)", async () => {
    const app = createServer({ authToken: "correct-token" });
    const response = await app.inject({
      method: "GET",
      url: "/api/health?token=correct-token"
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("does not guard non-/api routes, so the browser can load the page and get its token", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/" });
    // 404 (no webRoot configured in this test) - proves the auth guard never ran, since a guarded
    // route would 401 instead.
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("generates a different random token per server instance when none is given", async () => {
    const first = createServer();
    const second = createServer();
    expect(first.authToken).not.toBe(second.authToken);
    expect(first.authToken.length).toBeGreaterThanOrEqual(32);
    await first.close();
    await second.close();
  });
});
