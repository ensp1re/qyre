import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";

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
    const dir = mkdtempSync(join(tmpdir(), "qyre-files-root-"));
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
