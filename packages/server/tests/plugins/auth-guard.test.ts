import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

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
    // 404 confirms the unconfigured web route bypassed the API guard.
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

  // Exercise path variants so router normalization changes cannot bypass the guard.
  it.each([
    ["duplicate leading slash", "//api/health"],
    ["trailing slash", "/api/health/"],
    ["dot segment", "/./api/health"],
    ["uppercased path", "/API/health"],
    ["encoded slash", "/api%2Fhealth"]
  ])("never serves %s without a token", async (_label, url) => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url });

    // Either status is safe; an unauthenticated handler must never return 200.
    expect([401, 404]).toContain(response.statusCode);
    expect(response.statusCode).not.toBe(200);
    await app.close();
  });

  it("still serves the canonical path with a valid token", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  // Browser navigation uses a one-shot grant instead of a session token in the URL.
  it("accepts a minted download grant once, then never again", async () => {
    const app = createServer();
    const minted = await app.inject({
      method: "POST",
      url: "/api/exports/grant",
      headers: authHeaders(app)
    });
    const { grant } = minted.json() as { grant: string };

    const first = await app.inject({ method: "GET", url: `/api/health?grant=${grant}` });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({ method: "GET", url: `/api/health?grant=${grant}` });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a forged grant", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/health?grant=made-up" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("will not mint a grant for a caller without the session token", async () => {
    const app = createServer();
    const response = await app.inject({ method: "POST", url: "/api/exports/grant" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
