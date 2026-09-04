import type { ConnectionWarning } from "../../connection-warnings.js";
/**
 * Response shape for `POST /api/connect` (F064) - switches the running server to a different
 * database connection. See docs/product-specs/database-switching.md.
 */
export interface ConnectResponse {
  /** The new target, redacted the same way `HealthResponse.target` is. */
  readonly target: string;
  /**
   * Non-blocking transport-safety advisories for the string that was just connected (plaintext to
   * a remote host, security-weakening query parameters). The connection succeeded either way;
   * these exist so the choice is visible rather than silent. Absent when there is nothing to say.
   */
  readonly warnings?: readonly ConnectionWarning[];
}
