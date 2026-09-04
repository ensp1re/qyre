export class UnsupportedEngineError extends Error {
  constructor(engine: string) {
    super(`No database adapter is registered for engine "${engine}".`);
    this.name = "UnsupportedEngineError";
  }
}

/** A query violated the read-only policy. */
export class ReadOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyViolationError";
  }
}

/** An adapter operation was cancelled by the engine. */
export class OperationCancelledError extends Error {
  constructor() {
    super("The operation was cancelled.");
    this.name = "OperationCancelledError";
  }
}
