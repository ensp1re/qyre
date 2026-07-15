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

/**
 * Thrown by a cancellable adapter method (`getRows`/`runReadOnlyQuery`/`runQuery`, F126) when the
 * underlying driver reports the operation was cancelled server-side (Postgres `57014`, MySQL
 * `ER_QUERY_INTERRUPTED`, MongoDB `Interrupted`/`CursorKilled`) - each adapter translates its own
 * engine-specific cancellation error into this one shared class so `packages/server` can report a
 * distinct "cancelled" outcome instead of a generic failure, without depending on any concrete
 * engine package.
 */
export class OperationCancelledError extends Error {
  constructor() {
    super("The operation was cancelled.");
    this.name = "OperationCancelledError";
  }
}
