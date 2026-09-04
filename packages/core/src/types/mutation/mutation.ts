export interface InsertRowResult {
  readonly row?: Record<string, unknown>;
}

export interface UpdateRowResult {
  readonly matched: number;
}

export interface DeleteRowsResult {
  readonly deleted: number;
}

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
      readonly originalValues?: Record<string, unknown>;
      readonly missingOriginalFields?: readonly string[];
    }
  | {
      readonly type: "delete";
      readonly schema: string;
      readonly table: string;
      readonly keys: Array<Record<string, unknown>>;
    };

export type CommitMutationsResult =
  | {
      readonly committed: true;
      readonly results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult>;
    }
  | { readonly committed: false; readonly failedIndex: number; readonly appliedCount?: number };
