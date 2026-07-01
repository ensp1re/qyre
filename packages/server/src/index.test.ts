import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("does not serve static assets when no webRoot is given", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  describe("with a webRoot", () => {
    function makeWebRoot(): string {
      const dir = mkdtempSync(join(tmpdir(), "humb-web-"));
      writeFileSync(join(dir, "index.html"), "<html><body>Humb</body></html>");
      return dir;
    }

    it("serves index.html at the root", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Humb");
      await app.close();
    });

    it("falls back to index.html for unmatched non-API routes", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/some/client/route" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Humb");
      await app.close();
    });

    it("still returns JSON 404 for unmatched /api routes", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "Not found" });
      await app.close();
    });
  });
});
