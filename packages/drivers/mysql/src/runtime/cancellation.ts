import type { CancellationRegistry } from "@qyre/driver-contract";
import type mysql from "mysql2/promise";

/** Recognize MySQL query cancellations issued by `KILL QUERY`. */
export function isMysqlCancelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_QUERY_INTERRUPTED"
  );
}

/** Run with a MySQL connection that can be cancelled by operation ID. */
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
