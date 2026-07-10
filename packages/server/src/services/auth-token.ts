import { randomBytes, timingSafeEqual } from "node:crypto";

/** Generates a cryptographically random per-session bearer token (256 bits, hex-encoded) - F122. */
export function generateAuthToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time token comparison so a mismatch can't be timed to guess the token byte by byte. */
export function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
