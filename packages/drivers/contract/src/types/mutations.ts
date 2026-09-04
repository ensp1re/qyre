import type {
  CommitMutationsResult,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  UpdateRowResult
} from "@qyre/core";

export interface RowMutationApi {
  insertRow?(
    schema: string,
    table: string,
    values: Record<string, unknown>
  ): Promise<InsertRowResult>;
  updateRowByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>,
    expectedOriginal?: Record<string, unknown>
  ): Promise<UpdateRowResult>;
  updateFieldsByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>,
    originalValues: Record<string, unknown>,
    missingOriginalFields: readonly string[]
  ): Promise<UpdateRowResult>;
  deleteRowsByKey?(
    schema: string,
    table: string,
    keys: Array<Record<string, unknown>>
  ): Promise<DeleteRowsResult>;
  commitBatch?(ops: MutationOp[]): Promise<CommitMutationsResult>;
  getDocumentText?(schema: string, table: string, id: string): Promise<string | undefined>;
}
