import { Pool, types } from "pg";

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

// Keep date/time values as Postgres text: a JS Date drops microseconds, so a timestamptz key read
// back as a Date would never match its row again.
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => value);
types.setTypeParser(types.builtins.INTERVAL, (value) => value);

const TEXT_ARRAY_OID: number = 1009;
const DATE_ARRAY_OIDS = { timestamp: 1115, date: 1182, timestamptz: 1185 };
const parseTextArray = types.getTypeParser(TEXT_ARRAY_OID);
for (const oid of Object.values(DATE_ARRAY_OIDS)) types.setTypeParser(oid, parseTextArray);

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
