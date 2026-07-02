/**
 * Starts the real Humb server for Playwright, serving both the API and the built web app on one
 * port - the same shape as a real `npx humb <url>` launch, not a separate vite-preview process with
 * no backend behind it.
 *
 * Connects to Postgres only if HUMB_TEST_DATABASE_URL is set: `@smoke` specs need no database
 * (the server just reports "unconfigured"), `@full` specs need a live connection. Never opens a
 * browser - this is for Playwright's `webServer`, not interactive use.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionTarget } from "@humbdb/core";
import { parseConnectionTarget } from "@humbdb/core";
import type { DatabaseAdapter } from "@humbdb/driver-contract";
import { resolveAdapter } from "@humbdb/driver-contract";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { startServer } from "@humbdb/server";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

async function main(): Promise<void> {
  const databaseUrl = process.env.HUMB_TEST_DATABASE_URL?.trim();

  let adapter: DatabaseAdapter | undefined;
  let target: ConnectionTarget | undefined;
  if (databaseUrl) {
    target = parseConnectionTarget(databaseUrl);
    adapter = resolveAdapter([postgresAdapterFactory], target);
    await adapter.connect();
  }

  const server = await startServer({
    adapter,
    target,
    port: 4173,
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
