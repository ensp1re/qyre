import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseAdapter } from "@humbdb/driver-contract";
import { ReadOnlyViolationError } from "@humbdb/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer, EventLog } from "./index.js";

describe("createServer", () => {
  it("rejects a request with a non-loopback Host header (DNS-rebinding, F025)", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "attacker.example:7717" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid Host header." });
    await app.close();
  });

  it("accepts requests with 127.0.0.1, localhost, and IPv6 loopback Host headers", async () => {
    const app = createServer();
    for (const host of ["127.0.0.1:7717", "localhost:7717", "[::1]:7717", "localhost"]) {
      const response = await app.inject({ method: "GET", url: "/api/health", headers: { host } });
      expect(response.statusCode).toBe(200);
    }
    await app.close();
  });

  it("responds to /api/health with status ok and unconfigured database", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      database: "unconfigured",
      engineVersion: null,
      pingLatencyMs: null,
      lastError: null
    });
    await app.close();
  });

  it("reports a ping latency once connected (F042)", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.4",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    const body = response.json();
    expect(body.database).toBe("connected");
    expect(typeof body.pingLatencyMs).toBe("number");
    expect(body.pingLatencyMs).toBeGreaterThanOrEqual(0);
    expect(body.lastError).toBeNull();
    await app.close();
  });

  it("reports the ping failure's error message, and clears it once a later ping succeeds (F042)", async () => {
    let shouldFail = true;
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => {
        if (shouldFail) throw new Error("Connection terminated unexpectedly");
        return true;
      },
      getVersion: async () => "PostgreSQL 16.4",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });

    const failedResponse = await app.inject({ method: "GET", url: "/api/health" });
    expect(failedResponse.json()).toMatchObject({
      database: "disconnected",
      lastError: "Connection terminated unexpectedly"
    });

    shouldFail = false;
    const recoveredResponse = await app.inject({ method: "GET", url: "/api/health" });
    expect(recoveredResponse.json()).toMatchObject({ database: "connected", lastError: null });
    await app.close();
  });

  it("reports the adapter's engine version when connected", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.4",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.json()).toMatchObject({
      database: "connected",
      engineVersion: "PostgreSQL 16.4"
    });
    await app.close();
  });

  it("reports a null engine version when the adapter is disconnected", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => false,
      getVersion: async () => "PostgreSQL 16.4",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.json()).toMatchObject({ database: "disconnected", engineVersion: null });
    await app.close();
  });

  it("returns every table's metadata in one request (F027)", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({
        engine: "postgres",
        schemas: [{ name: "public", tables: ["a", "b"] }]
      }),
      getTable: async (schema, table) => ({ schema, name: table, columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({ method: "GET", url: "/api/tables" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tables: [
        { schema: "public", name: "a", columns: [] },
        { schema: "public", name: "b", columns: [] }
      ]
    });
    await app.close();
  });

  it("returns 503 for /api/tables when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/tables" });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("returns 503 for data endpoints when no adapter is configured", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/api/overview" });
    expect(response.statusCode).toBe(503);
    // F017: the global error handler must surface the real message under `error`, not Fastify's
    // default { statusCode, error: "Service Unavailable", message: "..." } shape (which the
    // frontend would misread as the reason phrase, not the actual detail).
    expect(response.json()).toMatchObject({ error: "No database connection is configured." });
    await app.close();
  });

  it("rejects an invalid query body with 400", async () => {
    const app = createServer();
    const response = await app.inject({ method: "POST", url: "/api/query", payload: {} });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns the real error message (not a generic one) when a query fails for a reason other than a read-only violation", async () => {
    // F017: found while testing F012 - a bad table name (or any non-ReadOnlyViolationError query
    // failure) used to fall through to Fastify's default error handler, which returns
    // { statusCode, error: "Internal Server Error", message: "<real detail>" } - apps/web's
    // fetchJson reads `error`, so the developer saw the useless reason phrase instead of the real
    // reason their query failed. The global error handler must fix this for any adapter, not just
    // Postgres specifically.
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => {
        throw new Error('relation "orders_items" does not exist');
      }
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "POST",
      url: "/api/query",
      payload: { sql: "SELECT * FROM orders_items" }
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: 'relation "orders_items" does not exist' });
    await app.close();
  });

  it("returns 400 (not 500) when the adapter rejects a read-only-violating query", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
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

  it("returns 400 (not 500) for invalid pagination params on the rows route", async () => {
    // F022: rowsQuerySchema.parse() used to throw straight into Fastify's default handler on bad
    // input, returning 500 with a raw stringified Zod issue dump - /api/query's safeParse pattern
    // is the correct precedent.
    const adapter: DatabaseAdapter = {
      engine: "postgres",
      connect: async () => {},
      disconnect: async () => {},
      ping: async () => true,
      getVersion: async () => "PostgreSQL 16.0",
      getOverview: async () => ({ engine: "postgres", schemas: [] }),
      getTable: async () => ({ schema: "public", name: "x", columns: [] }),
      getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
      runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
    };
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/tables/public/users/rows?page=abc"
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.any(String) });
    await app.close();
  });

  it("reads console events through a shared EventLog instance passed in (F028)", async () => {
    // Proves createServer's `eventLog` option is actually honored, not just accepted - startServer
    // passes the same instance back to the caller (e.g. the CLI, to wire an adapter's
    // onConnectionEvent into it) and expects GET /api/console to reflect anything logged into it.
    const eventLog = new EventLog();
    const app = createServer({ eventLog });
    eventLog.log("error", "Postgres pool error (connection dropped): test");

    const response = await app.inject({ method: "GET", url: "/api/console" });
    expect(response.json()).toMatchObject({
      events: [
        expect.objectContaining({ level: "error", message: expect.stringContaining("test") })
      ]
    });
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

    it("marks index.html as no-cache so a stale copy can't reference removed hashed assets (F044)", async () => {
      const app = createServer({ webRoot: makeWebRoot() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.headers["cache-control"]).toBe("no-cache");
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

  describe("Console tab (DF-07)", () => {
    it("starts with an empty event log", async () => {
      const app = createServer();
      const response = await app.inject({ method: "GET", url: "/api/console" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ events: [] });
      await app.close();
    });

    it("logs a query success event", async () => {
      const adapter: DatabaseAdapter = {
        engine: "postgres",
        connect: async () => {},
        disconnect: async () => {},
        ping: async () => true,
        getVersion: async () => "PostgreSQL 16.0",
        getOverview: async () => ({ engine: "postgres", schemas: [] }),
        getTable: async () => ({ schema: "public", name: "x", columns: [] }),
        getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
        runReadOnlyQuery: async () => ({
          columns: ["id"],
          rows: [{ id: 1 }],
          page: 0,
          pageSize: 1
        })
      };
      const app = createServer({ adapter });
      await app.inject({ method: "POST", url: "/api/query", payload: { sql: "SELECT 1" } });

      const response = await app.inject({ method: "GET", url: "/api/console" });
      const { events } = response.json();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ level: "info" });
      expect(events[0].message).toMatch(/1 rows returned/);
      await app.close();
    });

    it("logs a query rejection as a warn event", async () => {
      const adapter: DatabaseAdapter = {
        engine: "postgres",
        connect: async () => {},
        disconnect: async () => {},
        ping: async () => true,
        getVersion: async () => "PostgreSQL 16.0",
        getOverview: async () => ({ engine: "postgres", schemas: [] }),
        getTable: async () => ({ schema: "public", name: "x", columns: [] }),
        getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
        runReadOnlyQuery: async () => {
          throw new ReadOnlyViolationError("Only read-only statements are allowed.");
        }
      };
      const app = createServer({ adapter });
      await app.inject({ method: "POST", url: "/api/query", payload: { sql: "DELETE FROM t" } });

      const response = await app.inject({ method: "GET", url: "/api/console" });
      const { events } = response.json();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ level: "warn" });
      await app.close();
    });

    it("logs a connection-status transition but not the first observation", async () => {
      let connected = true;
      const adapter: DatabaseAdapter = {
        engine: "postgres",
        connect: async () => {},
        disconnect: async () => {},
        ping: async () => connected,
        getVersion: async () => "PostgreSQL 16.0",
        getOverview: async () => ({ engine: "postgres", schemas: [] }),
        getTable: async () => ({ schema: "public", name: "x", columns: [] }),
        getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
        runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
      };
      const app = createServer({ adapter });

      await app.inject({ method: "GET", url: "/api/health" });
      expect((await app.inject({ method: "GET", url: "/api/console" })).json().events).toEqual([]);

      connected = false;
      await app.inject({ method: "GET", url: "/api/health" });
      const { events } = (await app.inject({ method: "GET", url: "/api/console" })).json();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ level: "warn", message: "Database connection lost." });
      await app.close();
    });

    it("clears the event log", async () => {
      const adapter: DatabaseAdapter = {
        engine: "postgres",
        connect: async () => {},
        disconnect: async () => {},
        ping: async () => true,
        getVersion: async () => "PostgreSQL 16.0",
        getOverview: async () => ({ engine: "postgres", schemas: [] }),
        getTable: async () => ({ schema: "public", name: "x", columns: [] }),
        getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
        runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 })
      };
      const app = createServer({ adapter });
      await app.inject({ method: "POST", url: "/api/query", payload: { sql: "SELECT 1" } });

      const clearResponse = await app.inject({ method: "DELETE", url: "/api/console" });
      expect(clearResponse.statusCode).toBe(200);
      expect(clearResponse.json()).toEqual({ events: [] });

      const response = await app.inject({ method: "GET", url: "/api/console" });
      expect(response.json()).toEqual({ events: [] });
      await app.close();
    });
  });
});
