import type { CancellationRegistry } from "@qyre/driver-contract";

export class OperationRegistry implements CancellationRegistry {
  private readonly callbacks = new Map<string, () => Promise<void>>();

  register(operationId: string, cancel: () => Promise<void>): void {
    this.callbacks.set(operationId, cancel);
  }

  unregister(operationId: string): void {
    this.callbacks.delete(operationId);
  }

  async cancel(operationId: string): Promise<boolean> {
    const callback = this.callbacks.get(operationId);
    if (!callback) return false;
    this.callbacks.delete(operationId);
    await callback();
    return true;
  }
}
