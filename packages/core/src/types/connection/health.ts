/** Database connection status as reported by the server's health endpoint. */
export type ConnectionStatus = "connected" | "disconnected" | "unconfigured";

/**
 * Response shape for `GET /api/health`. Shared by the server (which produces it) and the web UI
 * (which consumes it), so the two can never silently drift apart.
 */
export interface HealthResponse {
  readonly status: "ok";
  readonly database: ConnectionStatus;
  readonly target: string | null;
  /** e.g. "PostgreSQL 16.1", "SQLite 3.45.0". Null when not connected or unavailable. */
  readonly engineVersion: string | null;
  /** Round-trip time of the ping this response is based on, in ms. Null when unconfigured (no
   * ping attempted) - "disconnected" and "slow" otherwise look identical from this endpoint alone. */
  readonly pingLatencyMs: number | null;
  /** The most recent ping failure's error message. Cleared back to null once a ping succeeds again -
   * this is "why the last failure happened", not a persistent error log (see the Console tab for
   * that). */
  readonly lastError: string | null;
}
