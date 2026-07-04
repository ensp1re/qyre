/**
 * The `humb` CLI: parse a database target, start the local server, and open the browser.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectionTarget } from "@humbdb/core";
import { resolveAdapter } from "@humbdb/driver-contract";
import { mongodbAdapterFactory } from "@humbdb/mongodb";
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
      "database connection string (postgres://user:pass@host:5432/db, mysql://user:pass@host:3306/db, mongodb://user:pass@host:27017/db) or a path to a SQLite file (./app.db)"
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

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

export interface ShutdownDeps {
  close: () => Promise<void>;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string) => void;
  timeoutMs?: number;
}

/**
 * Builds a `SIGINT`/`SIGTERM` handler (F043). Three things a bare `process.on("SIGINT", shutdown)`
 * didn't have: a timeout, so a wedged DB connection can't block Ctrl-C forever; a re-entrancy guard,
 * so a second signal while teardown is already in flight doesn't start a second concurrent teardown;
 * and a non-zero exit code on teardown failure, so a failed shutdown doesn't look identical to a
 * clean one to whatever's watching the process's exit code (a shell script, a process manager).
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let isShuttingDown = false;

  return async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Shutdown did not complete within ${timeoutMs}ms`)),
        timeoutMs
      );
      timer.unref();
    });

    try {
      await Promise.race([
        (async () => {
          await deps.close();
          await deps.disconnect();
        })(),
        timeout
      ]);
      deps.exit(0);
    } catch (error) {
      deps.log(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      deps.exit(1);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Run the CLI. Returns the running server's URL. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const target = parseConnectionTarget(args.target);
  const adapter = resolveAdapter(
    [postgresAdapterFactory, sqliteAdapterFactory, mysqlAdapterFactory, mongodbAdapterFactory],
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
  // Wired after startServer (not before adapter.connect() above) so the CLI doesn't need to
  // construct its own EventLog - the pool "error" listener checks onConnectionEvent at fire time,
  // not at connect()-time, so this order is fine (F028).
  adapter.onConnectionEvent = (level, message) => server.eventLog.log(level, message);
  process.stdout.write(`Humb is running at ${server.url}\n`);
  await open(server.url);

  const shutdown = createShutdownHandler({
    close: () => server.close(),
    disconnect: () => adapter.disconnect(),
    exit: (code) => process.exit(code),
    log: (message) => process.stderr.write(`${message}\n`)
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
