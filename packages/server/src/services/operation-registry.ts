import type { CancellationRegistry } from "@qyre/driver-contract";

/**
 * The server-side half of query cancellation (F126): tracks a cancel callback per client-supplied
 * `operationId`, registered by a cancellable adapter method (`getRows`/`runReadOnlyQuery`/
 * `runQuery`) once it has enough state to actually cancel (a captured pid/threadId/comment tag),
 * and triggered by `POST /api/operations/:id/cancel`. One instance lives on `ServerContext`,
 * assigned to whichever adapter is currently connected as `adapter.operationRegistry` (same
 * "server assigns a hook after connect()" pattern `onConnectionEvent` already uses) - it outlives
 * any single adapter swap (`POST /api/connect`), unlike the adapter itself.
 */
export class OperationRegistry implements CancellationRegistry {
  private readonly callbacks = new Map<string, () => Promise<void>>();

  register(operationId: string, cancel: () => Promise<void>): void {
    this.callbacks.set(operationId, cancel);
  }

  unregister(operationId: string): void {
    this.callbacks.delete(operationId);
  }

  /** Invokes and removes the registered callback for `operationId`, if any. Returns whether a
   * cancellable operation was actually found - `false` means either the operation already
   * finished, was never cancellable (e.g. SQLite), or the id is unknown. */
  async cancel(operationId: string): Promise<boolean> {
    const callback = this.callbacks.get(operationId);
    if (!callback) return false;
    this.callbacks.delete(operationId);
    await callback();
    return true;
  }
}
