/**
 * The `humb` CLI: parse a database target, start the local server, and open the browser.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectionTarget } from "@humb/core";
import { resolveAdapter } from "@humb/driver-contract";
import { postgresAdapterFactory } from "@humb/postgres";
import { startServer } from "@humb/server";
import { sqliteAdapterFactory } from "@humb/sqlite";
import { Command } from "commander";
import open from "open";

/**
 * Where the built `apps/web` static assets live relative to this file, in both source
 * (`src/index.ts`, for tests) and built (`dist/index.js`) form. `startServer` no-ops static
 * serving if this path doesn't contain a build, so this is safe even before `apps/web` is built.
 */
function defaultWebRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../apps/web/dist");
}

export interface CliArgs {
  target: string | undefined;
  port: number | undefined;
}

/** Parse CLI arguments. Throws (via commander) on malformed flags. */
export function parseArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .name("humb")
    .description("Launch a local-first database management UI from your terminal.")
    .argument(
      "[target]",
      "database connection string (postgres://user:pass@host:5432/db) or a path to a SQLite file (./app.db)"
    )
    .option("-p, --port <port>", "port for the local server", (value) => parseInt(value, 10))
    .allowExcessArguments(false)
    .exitOverride();

  program.parse(argv, { from: "user" });
  const opts = program.opts<{ port?: number }>();
  return { target: program.args[0], port: opts.port };
}

/** Resolve the port to listen on: `--port` flag, then `HUMB_PORT` env var, then the server default. */
export function resolvePort(
  flagPort: number | undefined,
  env: NodeJS.ProcessEnv
): number | undefined {
  if (flagPort !== undefined) {
    return flagPort;
  }
  const envPort = env.HUMB_PORT?.trim();
  if (!envPort) {
    return undefined;
  }
  const parsed = Number.parseInt(envPort, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Run the CLI. Returns the running server's URL. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const target = parseConnectionTarget(args.target);
  const adapter = resolveAdapter([postgresAdapterFactory, sqliteAdapterFactory], target);
  await adapter.connect();

  const port = resolvePort(args.port, process.env);
  const server = await startServer({
    adapter,
    target,
    port,
    logger: true,
    webRoot: defaultWebRoot()
  });
  process.stdout.write(`Humb is running at ${server.url}\n`);
  await open(server.url);

  const shutdown = async (): Promise<void> => {
    await server.close();
    await adapter.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
