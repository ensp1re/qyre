/** Result of a structured row insert (F099). See docs/product-specs/row-editing.md. */
export interface InsertRowResult {
  /** The inserted row, when the engine can report it (Postgres `RETURNING *`, MySQL re-fetched by
   * `insertId`, MongoDB the inserted document). Absent only if the engine truly cannot - never
   * guessed or partially reconstructed client-side. */
  readonly row?: Record<string, unknown>;
}

/** Result of a structured row update by primary key (F100). See docs/product-specs/row-editing.md. */
export interface UpdateRowResult {
  /** 0 or 1 for a single-key match; a composite key still identifies at most one row. 0 is a
   * distinct outcome ("stale row"), reported by the route as 409, never treated as a silent
   * no-op success. */
  readonly matched: number;
}
