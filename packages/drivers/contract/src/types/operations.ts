export type PermissionDenialKind = "permission" | "ownership" | "read-only";

export interface CancellationRegistry {
  register(operationId: string, cancel: () => Promise<void>): void;
  unregister(operationId: string): void;
}
