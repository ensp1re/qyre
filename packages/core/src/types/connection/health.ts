/** Database connection status as reported by the server's health endpoint. */
export type ConnectionStatus = "connected" | "disconnected" | "unconfigured";

/** Response from `GET /api/health`. */
export interface HealthResponse {
  readonly status: "ok";
  readonly database: ConnectionStatus;
  readonly target: string | null;
  /** e.g. "PostgreSQL 16.1", "SQLite 3.45.0". Null when not connected or unavailable. */
  readonly engineVersion: string | null;
  /** Round-trip time of the health ping, in milliseconds. */
  readonly pingLatencyMs: number | null;
  /** The most recent ping failure's error message. */
  readonly lastError: string | null;
}
