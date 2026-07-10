import { Pool, types } from "pg";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);

function resolveStatementTimeoutMs(): number {
  const raw = Number(process.env.QYRE_STATEMENT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATEMENT_TIMEOUT_MS;
}

/** Create the configured Postgres pool and route dropped idle connections to the adapter. */
export function createPostgresPool(
  connectionString: string,
  onError: (error: Error) => void
): Pool {
  const pool = new Pool({ connectionString, statement_timeout: resolveStatementTimeoutMs() });
  pool.on("error", onError);
  return pool;
}
