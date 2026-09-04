import type { ConnectionWarning } from "../../connection-warnings.js";
export interface ConnectResponse {
  /** The new target, redacted the same way `HealthResponse.target` is. */
  readonly target: string;
  /** Non-blocking transport-safety advisories for the connected target. */
  readonly warnings?: readonly ConnectionWarning[];
}
