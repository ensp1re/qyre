import { describe, expect, it } from "vitest";
import { createServer } from "./index.js";

describe("createServer", () => {
  it("responds to /api/health with status ok and unconfigured database", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", database: "unconfigured" });
    await app.close();
  });

  it("returns 503 for data endpoints when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/overview" });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("rejects an invalid query body with 400", async () => {
    const app = createServer();
    const response = await app.inject({ method: "POST", url: "/api/query", payload: {} });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
