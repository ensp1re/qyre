/**
 * The `humb` CLI: parse a database target, start the local server, and open the browser.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectionTarget } from "@humbdb/core";
import { resolveAdapter } from "@humbdb/driver-contract";
import { mysqlAdapterFactory } from "@humbdb/mysql";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { startServer } from "@humbdb/server";
import { sqliteAdapterFactory } from "@humbdb/sqlite";
import { Command } from "commander";
import open from "open";

/**
 * Where the built `apps/web` static assets live, relative to this file's own directory (`here` -
 * `dist` when built, `src` in dev/test). Two candidates, tried in order:
 *
 * 1. `<here>/web`, bundled alongside this file by `tsup.config.ts`'s `onSuccess` hook and shipped
 *    inside the published `humb` npm package (see `files` in `package.json`) - this is what
 *    resolves once installed standalone outside this monorepo (F010).
 * 2. `<here>/../../../apps/web/dist`, monorepo-relative - what resolves in local dev/test, where
 *    the bundled copy was never created.
 *
 * `startServer` no-ops static serving if neither path contains a build, so this is safe even
 * before `apps/web` is built at all.
 */
export function defaultWebRoot(here: string): string {
  const bundled = resolve(here, "web");
  if (existsSync(join(bundled, "index.html"))) {
    return bundled;
  }
  return resolve(here, "../../../apps/web/dist");
}

export interface CliArgs {
  target: string | undefined;
  port: number | undefined;
  filesDir: string | undefined;
}

/** Parse CLI arguments. Throws (via commander) on malformed flags. */
export function parseArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .name("humb")
    .description("Launch a local-first database management UI from your terminal.")
    .argument(
      "[target]",
      "database connection string (postgres://user:pass@host:5432/db, mysql://user:pass@host:3306/db) or a path to a SQLite file (./app.db)"
    )
    .option("-p, --port <port>", "port for the local server", (value) => parseInt(value, 10))
    .option(
      "--files-dir <dir>",
      "directory the Files tab may read *.sql files from (opt-in; disabled by default)"
    )
    .allowExcessArguments(false)
    .exitOverride();

  program.parse(argv, { from: "user" });
  const opts = program.opts<{ port?: number; filesDir?: string }>();
  return { target: program.args[0], port: opts.port, filesDir: opts.filesDir };
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

/** Resolves the `--files-dir` flag to an absolute path. Undefined means file browsing is disabled. */
export function resolveFilesRoot(filesDir: string | undefined, cwd: string): string | undefined {
  return filesDir ? resolve(cwd, filesDir) : undefined;
}

/** Run the CLI. Returns the running server's URL. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const target = parseConnectionTarget(args.target);
  const adapter = resolveAdapter(
    [postgresAdapterFactory, sqliteAdapterFactory, mysqlAdapterFactory],
    target
  );
  await adapter.connect();

  const filesRoot = resolveFilesRoot(args.filesDir, process.cwd());
  if (filesRoot && (!existsSync(filesRoot) || !statSync(filesRoot).isDirectory())) {
    throw new Error(`--files-dir "${filesRoot}" does not exist or is not a directory.`);
  }

  const port = resolvePort(args.port, process.env);
  const server = await startServer({
    adapter,
    target,
    port,
    logger: true,
    webRoot: defaultWebRoot(dirname(fileURLToPath(import.meta.url))),
    filesRoot
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
