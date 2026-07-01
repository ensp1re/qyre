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
}
