/**
 * Response shape for `POST /api/connect` (F064) - switches the running server to a different
 * database connection. See docs/product-specs/database-switching.md.
 */
export interface ConnectResponse {
  /** The new target, redacted the same way `HealthResponse.target` is. */
  readonly target: string;
}
