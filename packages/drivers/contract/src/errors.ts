/** Thrown when no registered adapter supports a connection target. */
export class UnsupportedEngineError extends Error {
  constructor(engine: string) {
    super(`No database adapter is registered for engine "${engine}".`);
    this.name = "UnsupportedEngineError";
  }
}

/**
 * Thrown when a query passed to `DatabaseAdapter.runReadOnlyQuery` violates Qyre's read-only
 * policy. Engine-agnostic so `packages/server` can catch it (and return 400) without depending on
 * any concrete engine package - every engine's query runner throws this same class.
 */
export class ReadOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyViolationError";
  }
}
