import { randomBytes, timingSafeEqual } from "node:crypto";

export function generateAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
