import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

describe("static web", () => {
  it("does not serve static assets when no webRoot is given", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  describe("with a webRoot", () => {
    function makeWebRoot(): string {
      const dir = mkdtempSync(join(tmpdir(), "qyre-web-"));
      writeFileSync(join(dir, "index.html"), "<html><head></head><body>Qyre</body></html>");
      return dir;
    }

    it("serves index.html at the root", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Qyre");
      await app.close();
    });

    it("falls back to index.html for unmatched non-API routes", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/some/client/route" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Qyre");
      await app.close();
    });

    it("still returns JSON 404 for unmatched /api routes", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
        headers: authHeaders(app)
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "Not found" });
      await app.close();
    });

    it("marks index.html as no-cache so a stale copy can't reference removed hashed assets (F044)", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.headers["cache-control"]).toBe("no-cache");
      await app.close();
    });

    it("injects the session token into index.html so the SPA can authenticate its first request (F122)", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.body).toContain(`window.__QYRE_TOKEN__ = "${app.authToken}"`);
      await app.close();
    });

    it("injects the token into the SPA-fallback index.html too", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/some/client/route" });
      expect(response.body).toContain(`window.__QYRE_TOKEN__ = "${app.authToken}"`);
      await app.close();
    });

    it("serves a tokenized index.html for a literal /index.html request too, not a raw copy", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/index.html" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`window.__QYRE_TOKEN__ = "${app.authToken}"`);
      await app.close();
    });

    it("caches a hashed bundle asset aggressively and compresses it when the client accepts it (F044)", async () => {
      const dir = makeWebRoot();
      mkdirSync(join(dir, "assets"));
      // Above @fastify/compress's default 1024-byte threshold, or it won't bother compressing.
      writeFileSync(join(dir, "assets", "index-abc123.js"), "x".repeat(2000));
      const app = createServer({ webRoot: dir });

      const response = await app.inject({
        method: "GET",
        url: "/assets/index-abc123.js",
        headers: { "accept-encoding": "gzip" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(response.headers["content-encoding"]).toBe("gzip");
      await app.close();
    });
  });
});
