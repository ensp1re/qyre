/**
 * Starts the real Humb server for Playwright, serving both the API and the built web app on one
 * port - the same shape as a real `npx humb <url>` launch, not a separate vite-preview process with
 * no backend behind it.
 *
 * Two instances of this run side by side (see playwright.config.ts's `webServer` array), one per
 * engine, so the same `connect-and-inspect.spec.ts` can exercise both without being duplicated:
 * - HUMB_TEST_SQLITE_PATH set: connects to that SQLite file (self-contained, no external service).
 * - HUMB_TEST_DATABASE_URL set (and no SQLite path): connects to that Postgres database.
 * - Neither set: `@smoke` specs need no database, the server just reports "unconfigured".
 * HUMB_E2E_PORT picks which port this instance listens on (default 4173). Never opens a browser -
 * this is for Playwright's `webServer`, not interactive use.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@humbdb/core";
import { parseConnectionTarget } from "@humbdb/core";
import type { DatabaseAdapter } from "@humbdb/driver-contract";
import { resolveAdapter } from "@humbdb/driver-contract";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { sqliteAdapterFactory } from "@humbdb/sqlite";
import { startServer } from "@humbdb/server";
import { ensureSqliteFile } from "@humbdb/testing";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

async function main(): Promise<void> {
  const sqlitePath = process.env.HUMB_TEST_SQLITE_PATH?.trim();
  const databaseUrl = process.env.HUMB_TEST_DATABASE_URL?.trim();
  const port = Number(process.env.HUMB_E2E_PORT ?? 4173);

  let adapter: DatabaseAdapter | undefined;
  let target: ConnectionTarget | undefined;
  if (sqlitePath) {
    // parseConnectionTarget requires the file to already exist (it fails fast otherwise, matching
    // real CLI behavior) - ensureSqliteFile creates an empty valid file first since this is a fresh
    // e2e fixture, not a user-provided one.
    ensureSqliteFile(sqlitePath);
    target = parseConnectionTarget(sqlitePath);
    adapter = resolveAdapter([sqliteAdapterFactory], target);
    await adapter.connect();
  } else if (databaseUrl) {
    target = parseConnectionTarget(databaseUrl);
    adapter = resolveAdapter([postgresAdapterFactory], target);
    await adapter.connect();
  }

  const server = await startServer({
    adapter,
    target,
    port,
    host: "127.0.0.1",
    webRoot,
    logger: false
  });
  process.stdout.write(`Humb E2E server listening at ${server.url}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Humb E2E server failed to start: ${(error as Error).message}\n`);
  process.exit(1);
});
