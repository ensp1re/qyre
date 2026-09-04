import type { CancellationRegistry } from "@qyre/driver-contract";
import type { MongoClient } from "mongodb";

/** Recognize MongoDB cancellation codes emitted by `killOp`. */
export function isMongoCancelError(error: unknown): boolean {
  const code = (error as { code?: number } | null | undefined)?.code;
  return code === 11601 || code === 237;
}

/** Register best-effort cancellation through MongoDB's `currentOp` and `killOp`. */
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
      // Cancellation is best effort.
    }
  });
}
