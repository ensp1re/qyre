import type { ConnectionTarget } from "@qyre/core";
import chalk from "chalk";

export type GuidedEngine = "postgres" | "mysql" | "mongodb";

export const GUIDED_ENGINE_DEFAULT_PORT: Record<GuidedEngine, string> = {
  postgres: "5432",
  mysql: "3306",
  mongodb: "27017"
};

const GUIDED_ENGINE_LABEL: Record<GuidedEngine, string> = {
  postgres: "Postgres",
  mysql: "MySQL",
  mongodb: "MongoDB"
};

const GUIDED_ENGINE_ORDER: GuidedEngine[] = ["postgres", "mysql", "mongodb"];

export interface GuidedLoginFields {
  engine: GuidedEngine;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export interface GuidedLoginPrompts {
  writeLine: (text: string) => void;
  ask: (question: string) => Promise<string>;
  /** Prompts with masked input when the terminal supports it. */
  askMasked: (question: string) => Promise<string>;
}

export function composeGuidedConnectionString(fields: GuidedLoginFields): string {
  const host = fields.host.trim() || "localhost";
  const port = fields.port.trim() || GUIDED_ENGINE_DEFAULT_PORT[fields.engine];
  const user = fields.user.trim();
  const password = fields.password.trim();
  const database = fields.database.trim();

  const auth = user
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  const path = database ? `/${encodeURIComponent(database)}` : "";
  return `${fields.engine}://${auth}${host}:${port}${path}`;
}

export function needsCredentialPrompt(target: ConnectionTarget): boolean {
  if (target.engine === "sqlite") return false;
  try {
    return new URL(target.raw).username === "";
  } catch {
    return false;
  }
}

async function promptForMissingCredentials(
  io: GuidedLoginPrompts,
  target: ConnectionTarget
): Promise<ConnectionTarget> {
  const url = new URL(target.raw);
  io.writeLine(
    chalk.dim("No credentials in the connection string - press enter to skip either field.")
  );
  const user = await io.ask("User: ");
  const password = user ? await io.askMasked("Password: ") : "";
  url.username = user;
  url.password = password;
  return { engine: target.engine, raw: url.toString() };
}

async function promptEngine(io: GuidedLoginPrompts): Promise<GuidedEngine> {
  io.writeLine(chalk.bold("Pick a database engine:"));
  GUIDED_ENGINE_ORDER.forEach((engine, index) => {
    io.writeLine(`  ${chalk.hex("#4a9eff")(`${index + 1})`)} ${GUIDED_ENGINE_LABEL[engine]}`);
  });
  for (;;) {
    const answer = await io.ask(`Engine [1-${GUIDED_ENGINE_ORDER.length}]: `);
    const index = Number.parseInt(answer, 10) - 1;
    if (index >= 0 && index < GUIDED_ENGINE_ORDER.length) {
      return GUIDED_ENGINE_ORDER[index]!;
    }
    io.writeLine(
      chalk.yellow(`"${answer}" isn't a valid choice - enter a number from the list above.`)
    );
  }
}

async function promptFields(
  io: GuidedLoginPrompts,
  engine: GuidedEngine
): Promise<GuidedLoginFields> {
  const user = await io.ask("User: ");
  const password = await io.askMasked("Password: ");
  const host = await io.ask("Host [localhost]: ");
  const port = await io.ask(`Port [${GUIDED_ENGINE_DEFAULT_PORT[engine]}]: `);
  const database = await io.ask("Database: ");
  return { engine, user, password, host, port, database };
}

async function promptRetry(io: GuidedLoginPrompts): Promise<boolean> {
  for (;;) {
    const answer = (await io.ask("Try again? (Y/n) ")).toLowerCase();
    if (answer === "" || answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    io.writeLine(chalk.yellow(`"${answer}" isn't a valid choice - enter Y or N.`));
  }
}

async function attemptWithRetry(
  io: GuidedLoginPrompts,
  buildRaw: () => Promise<string>,
  connect: (raw: string) => Promise<void>
): Promise<string> {
  for (;;) {
    const raw = await buildRaw();
    try {
      await connect(raw);
      return raw;
    } catch (error) {
      io.writeLine(
        chalk.red(`Could not connect: ${error instanceof Error ? error.message : String(error)}`)
      );
      if (!(await promptRetry(io))) {
        throw error;
      }
    }
  }
}

export async function runGuidedLogin(
  io: GuidedLoginPrompts,
  connect: (raw: string) => Promise<void>
): Promise<string> {
  const engine = await promptEngine(io);
  return attemptWithRetry(
    io,
    () => promptFields(io, engine).then(composeGuidedConnectionString),
    connect
  );
}

export async function fillMissingCredentials(
  io: GuidedLoginPrompts,
  target: ConnectionTarget,
  connect: (raw: string) => Promise<void>
): Promise<string> {
  return attemptWithRetry(
    io,
    () => promptForMissingCredentials(io, target).then((filled) => filled.raw),
    connect
  );
}
