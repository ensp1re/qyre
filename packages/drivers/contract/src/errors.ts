/** Thrown when no registered adapter supports a connection target. */
export class UnsupportedEngineError extends Error {
  constructor(engine: string) {
    super(`No database adapter is registered for engine "${engine}".`);
    this.name = "UnsupportedEngineError";
  }
}
