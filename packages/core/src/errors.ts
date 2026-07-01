/** Thrown when a connection target cannot be parsed or is unsupported. */
export class InvalidConnectionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionTargetError";
  }
}
