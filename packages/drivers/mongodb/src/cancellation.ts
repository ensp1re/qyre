import type { CancellationRegistry } from "@qyre/driver-contract";
import type { MongoClient } from "mongodb";

/** True when `error` is MongoDB's own "operation interrupted by killOp" signal (F126) - `11601`
 * (`Interrupted`) or `237` (`CursorKilled`), both distinct from `50` (`MaxTimeMSExpired`, the
 * unrelated `maxTimeMS` statement-timeout error `getRows` already uses) - no extra disambiguation
 * is needed the way Postgres's shared `57014` SQLSTATE requires. */
export function isMongoCancelError(error: unknown): boolean {
  const code = (error as { code?: number } | null | undefined)?.code;
  return code === 11601 || code === 237;
}

/**
 * Registers a best-effort cancel callback for `operationId` (F126). Unlike Postgres/MySQL,
 * MongoDB has no per-request connection to capture a pid/threadId from ahead of time (the driver
 * manages its own internal pool, invisible to adapter code) - cancellation instead relies on the
 * caller tagging its operation with a `comment: operationId` query option, and this callback
 * searching `currentOp` for that same comment to find the operation's real `opid` before calling
 * `killOp`. Requires the connected role to have `clusterMonitor`-adjacent privileges; a role
 * without them simply can't cancel, matching the spec's "best-effort... where permitted" - every
 * failure (missing privilege, the op already finished, an unsupported server version) is swallowed
 * silently rather than surfaced, since a failed cancel attempt shouldn't itself become a visible
 * error distinct from "nothing happened".
 */
export function registerMongoCancellation(
  client: MongoClient,
  registry: CancellationRegistry | undefined,
  operationId: string | undefined,
  schema: string
): void {
  if (!operationId || !registry) return;
  registry.register(operationId, async () => {
    try {
      const admin = client.db(schema).admin();
      const current = (await admin.command({
        currentOp: 1,
        "command.comment": operationId
      })) as { inprog?: Array<{ opid: unknown }> };
      const op = current.inprog?.[0];
      if (op) {
        await admin.command({ killOp: 1, op: op.opid });
      }
    } catch {
      // Best-effort - see doc comment above.
    }
  });
}
