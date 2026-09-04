import type { CancellationRegistry } from "@qyre/driver-contract";
import type { Pool, PoolClient } from "pg";

/** Recognize SQLSTATE 57014; callers distinguish user cancellation separately. */
export function isPgCancelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "57014"
  );
}

/** Run with a Postgres client that can be cancelled by operation ID. */
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
