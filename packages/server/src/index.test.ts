import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseAdapter } from "@humb/driver-contract";
import { ReadOnlyViolationError } from "@humb/driver-contract";
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

  it("returns 400 (not 500) when the adapter rejects a read-only-violating query", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => {
        throw new ReadOnlyViolationError("Only read-only statements are allowed.");
      }
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "DELETE FROM users" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Only read-only statements are allowed." });
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

  describe("Files tab (DF-06)", () => {
    it("reports disabled when no filesRoot is configured", async () => {
      const app = createServer();
      const response = await app.inject({ method: "GET", url: "/api/files" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: false, tree: [] });
      await app.close();
    });

    it("returns 503 for file content when no filesRoot is configured", async () => {
      const app = createServer();
      const response = await app.inject({
        method: "GET",
        url: "/api/files/content?path=schema.sql"
      });
      expect(response.statusCode).toBe(503);
      await app.close();
    });

    function makeFilesRoot(): string {
      const dir = mkdtempSync(join(tmpdir(), "humb-files-root-"));
      mkdirSync(join(dir, "migrations"));
      writeFileSync(join(dir, "migrations", "001_init.sql"), "CREATE TABLE t (id int);");
      writeFileSync(join(dir, "notes.txt"), "not sql");
      return dir;
    }

    it("lists the .sql tree when filesRoot is configured", async () => {
      const app = createServer({ filesRoot: makeFilesRoot() });
      const response = await app.inject({ method: "GET", url: "/api/files" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        enabled: true,
        tree: [
          {
            name: "migrations",
            path: "migrations",
            type: "directory",
            children: [{ name: "001_init.sql", path: "migrations/001_init.sql", type: "file" }]
          }
        ]
      });
      await app.close();
    });

    it("serves a valid file's content", async () => {
      const app = createServer({ filesRoot: makeFilesRoot() });
      const response = await app.inject({
        method: "GET",
        url: "/api/files/content?path=migrations/001_init.sql"
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        path: "migrations/001_init.sql",
        content: "CREATE TABLE t (id int);"
      });
      await app.close();
    });

    it("rejects a traversal attempt with 400, not the escaped file's content", async () => {
      const app = createServer({ filesRoot: makeFilesRoot() });
      const response = await app.inject({
        method: "GET",
        url: "/api/files/content?path=../../../../etc/passwd.sql"
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it("returns 404 for a path that doesn't exist", async () => {
      const app = createServer({ filesRoot: makeFilesRoot() });
      const response = await app.inject({
        method: "GET",
        url: "/api/files/content?path=missing.sql"
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });
});
