/**
 * The `qyre` CLI: parse a database target, start the local server, and open the browser.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, parseConnectionTarget, type ConnectionTarget } from "@qyre/core";
import { resolveAdapter, type AdapterFactory, type DatabaseAdapter } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { describeError, displayTarget, startServer } from "@qyre/server";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import chalk from "chalk";
import { Command } from "commander";
import figlet from "figlet";
import gradient from "gradient-string";
import open from "open";
import { createTerminalGuidedLoginIO } from "./guided-login-io.js";
import { fillMissingCredentials, needsCredentialPrompt, runGuidedLogin } from "./guided-login.js";

/**
 * Where the built `apps/web` static assets live, relative to this file's own directory (`here` -
 * `dist` when built, `src` in dev/test). Two candidates, tried in order:
 *
 * 1. `<here>/web`, bundled alongside this file by `tsup.config.ts`'s `onSuccess` hook and shipped
 *    inside the published `qyre` npm package (see `files` in `package.json`) - this is what
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
  verbose: boolean;
  login: boolean;
}

/** Parse CLI arguments. Throws (via commander) on malformed flags. */
export function parseArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .name("qyre")
    .description("Launch a local-first database management UI from your terminal.")
    .argument(
      "[target]",
      "database connection string (postgres://user:pass@host:5432/db, mysql://user:pass@host:3306/db, mongodb://user:pass@host:27017/db) or a path to a SQLite file (./app.db). Omit to start with no database connected and connect from the browser instead."
    )
    .option("-p, --port <port>", "port for the local server", (value) => parseInt(value, 10))
    .option(
      "--files-dir <dir>",
      "directory the Files tab may read *.sql files from (opt-in; disabled by default)"
    )
    .option("--verbose", "log every HTTP request (default: only warnings and errors)", false)
    .option(
      "--login",
      "skip the connection-string argument and enter connection details interactively (engine, user, password, host, port, database)",
      false
    )
    .addHelpText(
      "after",
      "\nNote: `npx <connection-url>` on its own (e.g. `npx postgres://...`) fails with npm's own\n" +
        "EUNSUPPORTEDPROTOCOL error - npx parses that URL as a package to install before qyre ever\n" +
        "runs. Always include the package name (`npx qyre <connection-url>`), or omit the URL and\n" +
        "run `npx qyre --login` for a guided, interactive setup instead.\n"
    )
    .allowExcessArguments(false)
    .exitOverride();

  program.parse(argv, { from: "user" });
  const opts = program.opts<{
    port?: number;
    filesDir?: string;
    verbose: boolean;
    login: boolean;
  }>();
  return {
    target: program.args[0],
    port: opts.port,
    filesDir: opts.filesDir,
    verbose: opts.verbose,
    login: opts.login
  };
}

/** Resolve the port to listen on: `--port` flag, then `QYRE_PORT` env var, then the server default. */
export function resolvePort(
  flagPort: number | undefined,
  env: NodeJS.ProcessEnv
): number | undefined {
  if (flagPort !== undefined) {
    return flagPort;
  }
  const envPort = env.QYRE_PORT?.trim();
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

/**
 * Reads this package's own version out of its `package.json`, relative to `here` (the directory
 * this file - or its built `dist/index.js` - lives in). `package.json` sits one level up from both
 * `src/` (dev) and `dist/` (built) and, unlike `dist/`, is never excluded from the published
 * package (npm always includes it regardless of the `files` allowlist), so this resolves
 * identically in the monorepo and once installed standalone.
 */
export function resolveVersion(here: string): string {
  const raw = readFileSync(join(here, "../package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

/**
 * Blue → purple gradient matching docs/references/design-system.md's dark-theme primary/accent
 * colors (`--primary`/`--c-blue` #4a9eff, `--c-purple` #c47eff) - the terminal banner and the
 * browser UI read as the same product instead of an arbitrary color choice.
 */
const qyreGradient = gradient(["#4a9eff", "#c47eff"]);

/**
 * Builds the banner printed on startup (F067; reworked into a big figlet wordmark in the same PR
 * as F073): a gradient "QYRE" title, then version/connection-status/URL/issue-and-contributing
 * links - the "proper open-source CLI" look most popular CLIs (nx, turbo, create-t3-app) use,
 * instead of a bare log line. Colors auto-disable when stdout isn't a TTY (chalk's own detection),
 * so piped/non-interactive output and test assertions on the plain text both stay unaffected.
 * `target: null` (F073 - no database given on the command line) prints an explicit "no database
 * connected yet" line instead of an empty/undefined one, so the no-target flow reads as intentional
 * rather than broken.
 */
export function formatBanner(info: {
  version: string;
  target: string | null;
  url: string;
}): string {
  const title = qyreGradient.multiline(figlet.textSync("QYRE"));
  const statusLine = info.target
    ? `${chalk.hex("#4fc46a")("●")} Connected to ${chalk.bold(info.target)}`
    : `${chalk.hex("#e09a40")("●")} No database connected yet ${chalk.dim("(run with --login for a guided terminal setup)")}`;

  return [
    title,
    `${chalk.dim(`v${info.version}`)}   ${statusLine}`,
    `${chalk.dim("Running at")} ${chalk.underline(info.url)}`,
    "",
    `${chalk.dim("Bugs:")}       https://github.com/ensp1re/qyre/issues`,
    `${chalk.dim("Contribute:")} https://github.com/ensp1re/qyre/blob/main/CONTRIBUTING.md`
  ].join("\n");
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

/** Parses `raw`, resolves its adapter, and connects. Reused by the direct-target path and both
 * guided-login flows so all three share the same connect-failure message. */
async function connectToRaw(
  raw: string,
  adapterFactories: AdapterFactory[]
): Promise<{ target: ConnectionTarget; adapter: DatabaseAdapter }> {
  const target = parseConnectionTarget(raw);
  const adapter = resolveAdapter(adapterFactories, target);
  try {
    await adapter.connect();
  } catch (error) {
    // Reuses the same AggregateError-unwrapping describeError() already applied to the
    // /api/health and /api/connect paths (F064) - this initial connect() had the same
    // empty-message bug for an unreachable host, just never routed through it before.
    throw new Error(`Could not connect to ${displayTarget(target)}: ${describeError(error)}`);
  }
  return { target, adapter };
}

/** Run the CLI. Returns the running server's URL. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const adapterFactories = [
    postgresAdapterFactory,
    sqliteAdapterFactory,
    mysqlAdapterFactory,
    mongodbAdapterFactory
  ];
  let target: ConnectionTarget | undefined;
  let adapter: DatabaseAdapter | undefined;

  if (args.login) {
    // F088: `--login` skips the connection-string argument entirely and builds one from prompted
    // fields (engine, user, password, host, port, database), retrying on a failed connect instead
    // of exiting.
    const io = createTerminalGuidedLoginIO();
    await runGuidedLogin(io, async (raw) => {
      ({ target, adapter } = await connectToRaw(raw, adapterFactories));
    });
  } else if (args.target) {
    const parsedTarget = parseConnectionTarget(args.target);
    // F088: a URL-shaped target with no username (e.g. `postgres://host:5432/db`) is prompted for
    // credentials interactively rather than attempted anonymously - but only when there's a
    // terminal to prompt on, so a piped/non-interactive invocation behaves exactly as before.
    if (needsCredentialPrompt(parsedTarget) && process.stdin.isTTY) {
      const io = createTerminalGuidedLoginIO();
      await fillMissingCredentials(io, parsedTarget, async (raw) => {
        ({ target, adapter } = await connectToRaw(raw, adapterFactories));
      });
    } else {
      ({ target, adapter } = await connectToRaw(args.target, adapterFactories));
    }
  }
  // F073: a target is no longer required at startup - omitting it (and --login) starts the server
  // unconnected (adapter/target both undefined, same "unconfigured" shape POST /api/connect already
  // produces for a fresh connection - see @qyre/server's health handler) and the browser opens
  // straight into the connect UI instead of the CLI failing with "no target provided".

  const filesRoot = resolveFilesRoot(args.filesDir, process.cwd());
  if (filesRoot && (!existsSync(filesRoot) || !statSync(filesRoot).isDirectory())) {
    throw new Error(`--files-dir "${filesRoot}" does not exist or is not a directory.`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const port = resolvePort(args.port, process.env) ?? DEFAULT_PORT;
  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({
      adapter,
      target,
      port,
      // F067: quiet by default (only warnings/errors) - `true` (every request, Fastify's default
      // level) is opt-in via --verbose, since per-request JSON logs drown out the startup banner.
      logger: args.verbose ? true : { level: "warn" },
      webRoot: defaultWebRoot(here),
      filesRoot,
      // F064: lets the running instance switch to a different database via POST /api/connect
      // instead of requiring a process restart.
      adapterFactories
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
      throw new Error(
        `Port ${port} is already in use. Try a different one with --port <port>, or stop whatever else is using it.`
      );
    }
    throw error;
  }
  // Wired after startServer (not before adapter.connect() above) so the CLI doesn't need to
  // construct its own EventLog - the pool "error" listener checks onConnectionEvent at fire time,
  // not at connect()-time, so this order is fine (F028).
  if (adapter) {
    adapter.onConnectionEvent = (level, message) => server.eventLog.log(level, message);
  }
  process.stdout.write(
    `${formatBanner({
      version: resolveVersion(here),
      target: target ? displayTarget(target) : null,
      url: server.url
    })}\n`
  );
  await open(server.url);

  const shutdown = createShutdownHandler({
    close: () => server.close(),
    disconnect: () => adapter?.disconnect() ?? Promise.resolve(),
    exit: (code) => process.exit(code),
    log: (message) => process.stderr.write(`${message}\n`)
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
