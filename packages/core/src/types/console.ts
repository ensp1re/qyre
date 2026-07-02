export type ConsoleEventLevel = "info" | "warn" | "error";

/** A single entry in the Console tab's recent connection/query activity stream. */
export interface ConsoleEvent {
  readonly id: number;
  readonly timestamp: string;
  readonly level: ConsoleEventLevel;
  readonly message: string;
}

/** Response for `GET /api/console` (and the cleared state `DELETE /api/console` returns). */
export interface ConsoleEvents {
  readonly events: ConsoleEvent[];
}
