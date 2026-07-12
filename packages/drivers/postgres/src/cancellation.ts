import type { CancellationRegistry } from "@qyre/driver-contract";
import type { Pool, PoolClient } from "pg";

/**
 * True when `error` carries Postgres's cancellation SQLSTATE (`57014`, `query_canceled`) - but
 * this code is NOT unique to a deliberate `pg_cancel_backend()` call: Postgres also reports
 * `57014` when `statement_timeout` expires on its own (F032's existing "aborts a runaway query"
 * behavior). Callers must additionally check `wasCancelledByUser()` (from
 * {@link withCancellableClient}) before treating this as a user-initiated cancellation (F126) -
 * this function alone only narrows "some 57014 happened", not who caused it.
 */
export function isPgCancelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "57014"
  );
}

/**
 * Checks out a client and, only when `operationId` is supplied, captures its backend pid and
 * registers a cancel callback that issues `pg_cancel_backend()` from the pool for that pid -
 * cancellable from another connection while the checked-out client's own query is still blocked
 * waiting on the database (F126). Omitting `operationId` skips the pid-capture round trip
 * entirely, keeping every caller that doesn't care about cancellation (tests, internal calls) on
 * the same cost as before this existed. Always releases the client and unregisters the callback
 * once `fn` settles, success or failure.
 *
 * `fn` receives `wasCancelledByUser()` - a flag set synchronously the instant the registered
 * cancel callback is invoked (before `pg_cancel_backend` itself is even awaited), so it's
 * guaranteed true by the time the original query's promise can possibly reject from that same
 * cancellation. This is the only reliable way to distinguish a deliberate cancel from Postgres's
 * own `statement_timeout` firing - both produce the identical `57014` SQLSTATE.
 */
export async function withCancellableClient<T>(
  pool: Pool,
  registry: CancellationRegistry | undefined,
  operationId: string | undefined,
  fn: (client: PoolClient, wasCancelledByUser: () => boolean) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  let cancelledByUser = false;
  try {
    if (operationId && registry) {
      const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const pid = pidResult.rows[0]?.pid;
      if (pid !== undefined) {
        registry.register(operationId, async () => {
          cancelledByUser = true;
          await pool.query("SELECT pg_cancel_backend($1)", [pid]);
        });
      }
    }
    return await fn(client, () => cancelledByUser);
  } finally {
    if (operationId) registry?.unregister(operationId);
    client.release();
  }
}
