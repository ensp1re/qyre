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

/** Result of a structured row delete by an explicit key list (F101). See docs/product-specs/row-editing.md. */
export interface DeleteRowsResult {
  /** May be less than the requested key count if some keys no longer match (stale) - the caller
   * reports exactly how many of the requested keys actually deleted something, never assuming the
   * full list succeeded. */
  readonly deleted: number;
}

/**
 * One staged operation in a batch commit (F102), shaped identically to the arguments
 * `insertRow`/`updateRowByKey`/`deleteRowsByKey` already take - the batch endpoint runs the same
 * primitives inside one transaction rather than introducing a parallel op format. `schema`/`table`
 * are per-op (not hoisted to the request) since a connection-wide commit isn't scoped to one table,
 * per docs/product-specs/row-editing.md.
 */
export type MutationOp =
  | {
      readonly type: "insert";
      readonly schema: string;
      readonly table: string;
      readonly values: Record<string, unknown>;
    }
  | {
      readonly type: "update";
      readonly schema: string;
      readonly table: string;
      readonly key: Record<string, unknown>;
      readonly changes: Record<string, unknown>;
      /** Original values for fields changed through MongoDB's shared grid editor. The adapter uses
       * these as an optimistic-concurrency guard; SQL batch drivers ignore them. */
      readonly originalValues?: Record<string, unknown>;
      /** Changed MongoDB fields that were absent, rather than explicitly null, in the loaded row. */
      readonly missingOriginalFields?: readonly string[];
    }
  | {
      readonly type: "delete";
      readonly schema: string;
      readonly table: string;
      readonly keys: Array<Record<string, unknown>>;
    };

/** Result of a staged mutation commit (F102/F146). SQL engines are transactional; MongoDB's
 * collection-grid coordinator reports the first failed ordered operation and how many earlier
 * operations were already applied. */
export type CommitMutationsResult =
  | {
      readonly committed: true;
      readonly results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult>;
    }
  | { readonly committed: false; readonly failedIndex: number; readonly appliedCount?: number };
