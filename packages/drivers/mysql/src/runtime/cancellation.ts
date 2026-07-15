import type { CancellationRegistry } from "@qyre/driver-contract";
import type mysql from "mysql2/promise";

/** True when `error` is MySQL's own `ER_QUERY_INTERRUPTED` (errno 1317) - the error a `KILL
 * QUERY <threadId>` command produces on the connection whose statement it interrupted (F126).
 * Unlike Postgres's `57014` (shared with `statement_timeout`), this code is specific to `KILL
 * QUERY` - mysql2's own client-side `timeout` option closes the connection instead of producing
 * this error (see docs/product-specs/sql-editor.md's "Statement timeout" section), so no
 * additional disambiguation is needed here. */
export function isMysqlCancelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_QUERY_INTERRUPTED"
  );
}

/**
 * Checks out a connection and, only when `operationId` is supplied, reads its `threadId` (no
 * extra round trip needed - mysql2 exposes it synchronously on the checked-out connection) and
 * registers a cancel callback that issues `KILL QUERY <threadId>` from the pool - cancellable
 * from another connection while the checked-out one's own query is still blocked waiting on the
 * server (F126). Always releases the connection and unregisters the callback once `fn` settles.
 */
export async function withCancellableConnection<T>(
  pool: mysql.Pool,
  registry: CancellationRegistry | undefined,
  operationId: string | undefined,
  fn: (connection: mysql.PoolConnection, wasCancelledByUser: () => boolean) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  let cancelledByUser = false;
  try {
    if (operationId && registry && connection.threadId !== null) {
      const threadId = connection.threadId;
      registry.register(operationId, async () => {
        cancelledByUser = true;
        await pool.query(`KILL QUERY ${threadId}`);
      });
    }
    return await fn(connection, () => cancelledByUser);
  } finally {
    if (operationId) registry?.unregister(operationId);
    connection.release();
  }
}
