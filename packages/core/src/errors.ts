export class InvalidConnectionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionTargetError";
  }
}
