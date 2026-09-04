export interface RowPage {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
}

export interface QueryExecutionResult {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly rowsAffected: number;
}

export interface QueryPlanResult {
  readonly lines: string[];
  readonly classification: StatementClassification;
  readonly analyzed: boolean;
}

export type StatementClassification = "read" | "mutation" | "ddl" | "destructive";

export interface CancelOperationResult {
  readonly cancelled: boolean;
}

export type SortDirection = "asc" | "desc";

export interface RowSort {
  readonly column: string;
  readonly direction: SortDirection;
}

export const FILTER_OPS = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "isNull",
  "isNotNull"
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface RowFilter {
  readonly column: string;
  readonly op: FilterOp;
  readonly value?: string;
  readonly columnDataType?: string;
}

export const ROW_EXPORT_FORMATS = ["csv", "json", "sql"] as const;
export type RowExportFormat = (typeof ROW_EXPORT_FORMATS)[number];

export type JsonExportMode = "json" | "extended-json";
