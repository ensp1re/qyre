/**
 * Interactive terminal guided login (F088): lets a user build a connection string field-by-field
 * instead of typing a full URL - either from scratch (`--login`) or to fill in credentials missing
 * from a target already given on the command line. Mirrors `packages/ui`'s connect-drawer field
 * mode (same engines, same default ports) without depending on `@qyre/ui` from a Node CLI package.
 */
import type { ConnectionTarget } from "@qyre/core";

/** Engines the guided flow supports - matches connect-drawer's field-entry mode. SQLite's
 * file-path shape doesn't fit a user/password/host/port form, so it's URL/path-only there too. */
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

/** Prompting primitives the guided flow runs against - implemented for real stdin/stdout by
 * `createTerminalGuidedLoginIO` (see `guided-login-io.ts`), and stubbed in tests. */
export interface GuidedLoginPrompts {
  writeLine: (text: string) => void;
  /** Asks a plain-text question; resolves with the trimmed answer. */
  ask: (question: string) => Promise<string>;
  /** Asks for a password; input is masked (echoed as `*`) as it's typed. */
  askMasked: (question: string) => Promise<string>;
}

/** Mirrors `packages/ui`'s `composeConnectionString` for the CLI's own runtime. */
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

/** True when `target` is a URL-shaped engine with no username in its connection string - the
 * signal that a user handed us `postgres://host:5432/db` and needs to be asked for credentials
 * rather than silently attempting an anonymous connection. */
export function needsCredentialPrompt(target: ConnectionTarget): boolean {
  if (target.engine === "sqlite") return false;
  try {
    return new URL(target.raw).username === "";
  } catch {
    return false;
  }
}

/** Fills in a missing user/password on `target` from prompted input, leaving both blank (and the
 * target otherwise unchanged) if the user just presses enter. */
async function promptForMissingCredentials(
  io: GuidedLoginPrompts,
  target: ConnectionTarget
): Promise<ConnectionTarget> {
  const url = new URL(target.raw);
  io.writeLine(`No credentials in the connection string - press enter to skip either field.`);
  const user = await io.ask("User: ");
  const password = user ? await io.askMasked("Password: ") : "";
  url.username = user;
  url.password = password;
  return { engine: target.engine, raw: url.toString() };
}

async function promptEngine(io: GuidedLoginPrompts): Promise<GuidedEngine> {
  io.writeLine("Pick a database engine:");
  GUIDED_ENGINE_ORDER.forEach((engine, index) => {
    io.writeLine(`  ${index + 1}) ${GUIDED_ENGINE_LABEL[engine]}`);
  });
  for (;;) {
    const answer = await io.ask(`Engine [1-${GUIDED_ENGINE_ORDER.length}]: `);
    const index = Number.parseInt(answer, 10) - 1;
    if (index >= 0 && index < GUIDED_ENGINE_ORDER.length) {
      return GUIDED_ENGINE_ORDER[index]!;
    }
    io.writeLine(`"${answer}" isn't a valid choice - enter a number from the list above.`);
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
    io.writeLine(`"${answer}" isn't a valid choice - enter Y or N.`);
  }
}

/** Builds a connection string via `buildRaw`, attempts `connect`, and on failure shows the real
 * error and offers retry (Y, re-runs `buildRaw`) or quit (N, rethrows). Resolves with the
 * connection string once `connect` succeeds. */
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
      io.writeLine(`Could not connect: ${error instanceof Error ? error.message : String(error)}`);
      if (!(await promptRetry(io))) {
        throw error;
      }
    }
  }
}

/** Runs the full guided login: pick an engine once, then enter fields and attempt to connect,
 * retrying the field entry on failure until it succeeds or the user quits. */
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

/** Runs the guided flow for a target that's missing credentials: prompts for user/password,
 * attempts to connect, and retries the prompt on failure until it succeeds or the user quits. */
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
