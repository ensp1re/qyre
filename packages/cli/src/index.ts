import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  connectionWarnings,
  DEFAULT_PORT,
  parseConnectionTarget,
  type ConnectionTarget,
  type ConnectionWarning
} from "@qyre/core";
import { resolveAdapter, type AdapterFactory, type DatabaseAdapter } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { describeError, displayTarget, startServer } from "@qyre/server";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import chalk from "chalk";
import { Command, InvalidArgumentError } from "commander";
import figlet from "figlet";
import gradient from "gradient-string";
import open from "open";
import { createTerminalGuidedLoginIO } from "./guided-login-io.js";
import { fillMissingCredentials, needsCredentialPrompt, runGuidedLogin } from "./guided-login.js";

const qyreGradient = gradient(["#4a9eff", "#c47eff"]);

function renderQyreTitle(): string {
  return qyreGradient.multiline(figlet.textSync("QYRE"));
}

/** Resolve bundled or monorepo web assets. */
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
  readOnly: boolean;
}

function parsePortFlag(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new InvalidArgumentError("Port must be an integer between 0 and 65535.");
  }
  return port;
}

export function parseArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .name("qyre")
    .description("Launch a local-first database management UI from your terminal.")
    .version(resolveVersion(dirname(fileURLToPath(import.meta.url))), "-v, --version")
    .argument(
      "[target]",
      "database connection string (postgres://user:pass@host:5432/db, mysql://user:pass@host:3306/db, mongodb://user:pass@host:27017/db) or a path to a SQLite file (./app.db). Omit to start with no database connected and connect from the browser instead."
    )
    .option("-p, --port <port>", "port for the local server", parsePortFlag)
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
    .option(
      "--read-only",
      "force the whole session read-only regardless of what your database role would otherwise allow",
      false
    )
    .addHelpText("beforeAll", () => `${renderQyreTitle()}\n`)
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
    readOnly: boolean;
  }>();
  return {
    target: program.args[0],
    port: opts.port,
    filesDir: opts.filesDir,
    verbose: opts.verbose,
    login: opts.login,
    readOnly: opts.readOnly
  };
}

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

export function resolveFilesRoot(filesDir: string | undefined, cwd: string): string | undefined {
  return filesDir ? resolve(cwd, filesDir) : undefined;
}

export function resolveVersion(here: string): string {
  const raw = readFileSync(join(here, "../package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

export function formatBanner(info: {
  version: string;
  target: string | null;
  url: string;
  warnings?: readonly ConnectionWarning[];
}): string {
  const title = renderQyreTitle();
  const statusLine = info.target
    ? `${chalk.hex("#4fc46a")("●")} Connected to ${chalk.bold(info.target)}`
    : `${chalk.hex("#e09a40")("●")} No database connected yet ${chalk.dim("(run with --login for a guided terminal setup)")}`;

  const warningLines = (info.warnings ?? []).map(
    (warning) => `${chalk.hex("#e09a40")("!")} ${chalk.yellow(warning.message)}`
  );

  return [
    title,
    `${chalk.dim(`v${info.version}`)}   ${statusLine}`,
    `${chalk.dim("Running at")} ${chalk.underline(info.url)}`,
    ...warningLines,
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

/** Create a signal handler with bounded, serialized shutdown. */
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

/** Connect and ping a target before returning its adapter. */
async function connectToRaw(
  raw: string,
  adapterFactories: AdapterFactory[]
): Promise<{ target: ConnectionTarget; adapter: DatabaseAdapter }> {
  const target = parseConnectionTarget(raw);
  const adapter = resolveAdapter(adapterFactories, target);
  try {
    await adapter.connect();
    if (!(await adapter.ping())) {
      throw new Error("Connected, but the target did not respond to a ping.");
    }
  } catch (error) {
    throw new Error(`Could not connect to ${displayTarget(target)}: ${describeError(error)}`);
  }
  return { target, adapter };
}

function printGuidedLoginIntro(): void {
  process.stdout.write(`${renderQyreTitle()}\n${chalk.dim("Guided setup")}\n\n`);
}

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
    printGuidedLoginIntro();
    const io = createTerminalGuidedLoginIO();
    await runGuidedLogin(io, async (raw) => {
      ({ target, adapter } = await connectToRaw(raw, adapterFactories));
    });
  } else if (args.target) {
    const parsedTarget = parseConnectionTarget(args.target);
    if (needsCredentialPrompt(parsedTarget) && process.stdin.isTTY) {
      printGuidedLoginIntro();
      const io = createTerminalGuidedLoginIO();
      await fillMissingCredentials(io, parsedTarget, async (raw) => {
        ({ target, adapter } = await connectToRaw(raw, adapterFactories));
      });
    } else {
      ({ target, adapter } = await connectToRaw(args.target, adapterFactories));
    }
  }
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
      logger: args.verbose ? true : { level: "warn" },
      webRoot: defaultWebRoot(here),
      filesRoot,
      adapterFactories,
      readOnly: args.readOnly
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
      throw new Error(
        `Port ${port} is already in use. Try a different one with --port <port>, or stop whatever else is using it.`
      );
    }
    throw error;
  }
  if (adapter) {
    adapter.onConnectionEvent = (level, message) => server.eventLog.log(level, message);
  }
  process.stdout.write(
    `${formatBanner({
      version: resolveVersion(here),
      target: target ? displayTarget(target) : null,
      url: server.url,
      warnings: target ? connectionWarnings(target.raw) : undefined
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
