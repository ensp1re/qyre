/**
 * Starts the real Humb server for Playwright, serving both the API and the built web app on one
 * port - the same shape as a real `npx humb <url>` launch, not a separate vite-preview process with
 * no backend behind it.
 *
 * Instances of this run side by side (see playwright.config.ts's `webServer` array), one per
 * engine with Playwright e2e coverage, so the same `connect-and-inspect.spec.ts` can exercise all
 * of them without being duplicated. `HUMB_E2E_ENGINE` ("postgres" | "sqlite" | "mysql" | "mongodb",
 * default "postgres") tells each instance which one it is - this can't be inferred from
 * "whichever test-DB env var happens to be set" the way an earlier version of this file did:
 * Playwright's config process sets HUMB_TEST_SQLITE_PATH globally and spawns every webServer
 * command from that same process, so HUMB_TEST_SQLITE_PATH/HUMB_TEST_DATABASE_URL/
 * HUMB_TEST_MYSQL_URL are all simultaneously present in every instance's env once a developer sets
 * more than one for a `pnpm test:e2e:full` run - found live while adding the "mysql"
 * project/instance (F014), which was silently connecting to SQLite instead of MySQL under the old
 * "first truthy var wins" logic.
 * - "postgres": connects to HUMB_TEST_DATABASE_URL.
 * - "sqlite": connects to HUMB_TEST_SQLITE_PATH (self-contained, no external service).
 * - "mysql": connects to HUMB_TEST_MYSQL_URL.
 * - "mongodb": connects to HUMB_TEST_MONGO_URL. No Playwright project uses this engine (F015 has
 *   no e2e coverage - see docs/product-specs/connect-and-inspect-mongodb.md) - this branch backs
 *   `.local/preview-server-mongo.mjs` for manual verification instead.
 * - No target env var set for the selected engine: `@smoke` specs need no database, the server
 *   just reports "unconfigured".
 * HUMB_E2E_PORT picks which port this instance listens on (default 4173). Never opens a browser -
 * this is for Playwright's `webServer`, not interactive use.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@humbdb/core";
import { parseConnectionTarget } from "@humbdb/core";
import type { DatabaseAdapter } from "@humbdb/driver-contract";
import { resolveAdapter } from "@humbdb/driver-contract";
import { mongodbAdapterFactory } from "@humbdb/mongodb";
import { mysqlAdapterFactory } from "@humbdb/mysql";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { sqliteAdapterFactory } from "@humbdb/sqlite";
import { startServer } from "@humbdb/server";
import { ensureSqliteFile } from "@humbdb/testing";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

async function main(): Promise<void> {
  const engine = process.env.HUMB_E2E_ENGINE ?? "postgres";
  const port = Number(process.env.HUMB_E2E_PORT ?? 4173);

  let adapter: DatabaseAdapter | undefined;
  let target: ConnectionTarget | undefined;
  if (engine === "sqlite") {
    const sqlitePath = process.env.HUMB_TEST_SQLITE_PATH?.trim();
    if (sqlitePath) {
      // parseConnectionTarget requires the file to already exist (it fails fast otherwise,
      // matching real CLI behavior) - ensureSqliteFile creates an empty valid file first since
      // this is a fresh e2e fixture, not a user-provided one.
      ensureSqliteFile(sqlitePath);
      target = parseConnectionTarget(sqlitePath);
      adapter = resolveAdapter([sqliteAdapterFactory], target);
      await adapter.connect();
    }
  } else if (engine === "mysql") {
    const mysqlUrl = process.env.HUMB_TEST_MYSQL_URL?.trim();
    if (mysqlUrl) {
      target = parseConnectionTarget(mysqlUrl);
      adapter = resolveAdapter([mysqlAdapterFactory], target);
      await adapter.connect();
    }
  } else if (engine === "mongodb") {
    const mongoUrl = process.env.HUMB_TEST_MONGO_URL?.trim();
    if (mongoUrl) {
      target = parseConnectionTarget(mongoUrl);
      adapter = resolveAdapter([mongodbAdapterFactory], target);
      await adapter.connect();
    }
  } else {
    const databaseUrl = process.env.HUMB_TEST_DATABASE_URL?.trim();
    if (databaseUrl) {
      target = parseConnectionTarget(databaseUrl);
      adapter = resolveAdapter([postgresAdapterFactory], target);
      await adapter.connect();
    }
  }

  const server = await startServer({
    adapter,
    target,
    port,
    host: "127.0.0.1",
    webRoot,
    logger: false,
    // F064: mirrors the real CLI's main() - lets @full specs and manual Preview verification
    // exercise POST /api/connect against any supported engine, not just the one this instance
    // started with.
    adapterFactories: [
      postgresAdapterFactory,
      sqliteAdapterFactory,
      mysqlAdapterFactory,
      mongodbAdapterFactory
    ]
  });
  process.stdout.write(`Humb E2E server listening at ${server.url}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Humb E2E server failed to start: ${(error as Error).message}\n`);
  process.exit(1);
});
