/** Result of a structured row insert (F099). See docs/product-specs/row-editing.md. */
export interface InsertRowResult {
  /** The inserted row, when the engine can report it (Postgres `RETURNING *`, MySQL re-fetched by
   * `insertId`, MongoDB the inserted document). Absent only if the engine truly cannot - never
   * guessed or partially reconstructed client-side. */
  readonly row?: Record<string, unknown>;
}
