/**
 * Starts the real Qyre server for Playwright, serving both the API and the built web app on one
 * port - the same shape as a real `npx qyre <url>` launch, not a separate vite-preview process with
 * no backend behind it.
 *
 * Instances of this run side by side (see playwright.config.ts's `webServer` array), one per
 * engine with Playwright e2e coverage, so the same `connect-and-inspect.spec.ts` can exercise all
 * of them without being duplicated. `QYRE_E2E_ENGINE` ("postgres" | "sqlite" | "mysql" | "mongodb",
 * default "postgres") tells each instance which one it is - this can't be inferred from
 * "whichever test-DB env var happens to be set" the way an earlier version of this file did:
 * Playwright's config process sets QYRE_TEST_SQLITE_PATH globally and spawns every webServer
 * command from that same process, so QYRE_TEST_SQLITE_PATH/QYRE_TEST_DATABASE_URL/
 * QYRE_TEST_MYSQL_URL are all simultaneously present in every instance's env once a developer sets
 * more than one for a `pnpm test:e2e:full` run - found live while adding the "mysql"
 * project/instance (F014), which was silently connecting to SQLite instead of MySQL under the old
 * "first truthy var wins" logic.
 * - "postgres": connects to QYRE_TEST_DATABASE_URL.
 * - "sqlite": connects to QYRE_TEST_SQLITE_PATH (self-contained, no external service).
 * - "mysql": connects to QYRE_TEST_MYSQL_URL.
 * - "mongodb": connects to QYRE_TEST_MONGO_URL. Browse journeys run against it; SQL-only journeys
 *   skip it explicitly.
 * - No target env var set for the selected engine: `@smoke` specs need no database, the server
 *   just reports "unconfigured".
 * QYRE_E2E_PORT picks which port this instance listens on (default 4173). Never opens a browser -
 * this is for Playwright's `webServer`, not interactive use.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@qyre/core";
import { parseConnectionTarget } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { resolveAdapter } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import { startServer } from "@qyre/server";
import { ensureSqliteFile } from "@qyre/testing";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

async function main(): Promise<void> {
  const engine = process.env.QYRE_E2E_ENGINE ?? "postgres";
  const port = Number(process.env.QYRE_E2E_PORT ?? 4173);

  let adapter: DatabaseAdapter | undefined;
  let target: ConnectionTarget | undefined;
  if (engine === "sqlite") {
    const sqlitePath = process.env.QYRE_TEST_SQLITE_PATH?.trim();
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
    const mysqlUrl = process.env.QYRE_TEST_MYSQL_URL?.trim();
    if (mysqlUrl) {
      target = parseConnectionTarget(mysqlUrl);
      adapter = resolveAdapter([mysqlAdapterFactory], target);
      await adapter.connect();
    }
  } else if (engine === "mongodb") {
    const mongoUrl = process.env.QYRE_TEST_MONGO_URL?.trim();
    if (mongoUrl) {
      target = parseConnectionTarget(mongoUrl);
      adapter = resolveAdapter([mongodbAdapterFactory], target);
      await adapter.connect();
    }
  } else {
    const databaseUrl = process.env.QYRE_TEST_DATABASE_URL?.trim();
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
  process.stdout.write(`Qyre E2E server listening at ${server.url}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Qyre E2E server failed to start: ${(error as Error).message}\n`);
  process.exit(1);
});
