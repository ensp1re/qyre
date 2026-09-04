import { chmodSync, existsSync } from "node:fs";
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
import { requireReadOnlyTestDatabaseUrl, requireReadOnlyTestMysqlUrl } from "@qyre/testing";
import { setupFixture } from "@qyre/testing/postgres";
import { setupMysqlFixture } from "@qyre/testing/mysql";
import { ensureSqliteFile, setupSqliteFixture } from "@qyre/testing/sqlite";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

/** Start the API and built web app for one Playwright project. */
async function main(): Promise<void> {
  const engine = process.env.QYRE_E2E_ENGINE ?? "postgres";
  const port = Number(process.env.QYRE_E2E_PORT ?? 4173);
  const restricted = process.env.QYRE_E2E_RESTRICTED === "1";

  let adapter: DatabaseAdapter | undefined;
  let target: ConnectionTarget | undefined;
  if (engine === "sqlite") {
    const sqlitePath = (
      restricted ? process.env.QYRE_E2E_READONLY_SQLITE_PATH : process.env.QYRE_TEST_SQLITE_PATH
    )?.trim();
    if (sqlitePath) {
      // Create the file before parsing; the CLI rejects missing SQLite paths.
      if (restricted) {
        const fixtureDir = dirname(sqlitePath);
        if (existsSync(fixtureDir)) chmodSync(fixtureDir, 0o755);
        if (existsSync(sqlitePath)) chmodSync(sqlitePath, 0o644);
        setupSqliteFixture(sqlitePath);
        chmodSync(sqlitePath, 0o444);
        chmodSync(fixtureDir, 0o555);
      } else {
        ensureSqliteFile(sqlitePath);
      }
      target = parseConnectionTarget(sqlitePath);
      adapter = resolveAdapter([sqliteAdapterFactory], target);
      await adapter.connect();
    }
  } else if (engine === "mysql") {
    const mysqlUrl = process.env.QYRE_TEST_MYSQL_URL?.trim();
    if (mysqlUrl) {
      if (restricted) await setupMysqlFixture(mysqlUrl);
      target = parseConnectionTarget(restricted ? requireReadOnlyTestMysqlUrl(mysqlUrl) : mysqlUrl);
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
      if (restricted) await setupFixture(databaseUrl);
      target = parseConnectionTarget(
        restricted ? requireReadOnlyTestDatabaseUrl(databaseUrl) : databaseUrl
      );
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
    adapterFactories: [
      postgresAdapterFactory,
      sqliteAdapterFactory,
      mysqlAdapterFactory,
      mongodbAdapterFactory
    ],
    readOnly: process.env.QYRE_E2E_READ_ONLY === "1"
  });
  process.stdout.write(`Qyre E2E server listening at ${server.url}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Qyre E2E server failed to start: ${(error as Error).message}\n`);
  process.exit(1);
});
