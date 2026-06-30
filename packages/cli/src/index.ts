/**
 * The `humb` CLI: parse a database target, start the local server, and open the browser.
 */
import { parseConnectionTarget } from "@humb/core";
import { resolveAdapter } from "@humb/db-adapter";
import { postgresAdapterFactory } from "@humb/db-postgres";
import { startServer } from "@humb/server";
import { Command } from "commander";
import open from "open";

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
    .argument("[target]", "database connection string, e.g. postgres://user:pass@host:5432/db")
    .option("-p, --port <port>", "port for the local server", (value) => parseInt(value, 10))
    .allowExcessArguments(false)
    .exitOverride();

  program.parse(argv, { from: "user" });
  const opts = program.opts<{ port?: number }>();
  return { target: program.args[0], port: opts.port };
}

/** Run the CLI. Returns the running server's URL. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const target = parseConnectionTarget(args.target);
  const adapter = resolveAdapter([postgresAdapterFactory], target);
  await adapter.connect();

  const server = await startServer({ adapter, target, port: args.port, logger: true });
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
