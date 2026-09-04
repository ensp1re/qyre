import type { StatementClassification } from "@qyre/core";

export interface QueryHistoryEntry {
  readonly sql: string;
  readonly ranAt: number;
  readonly classification?: StatementClassification;
}

export interface CompletionTable {
  readonly name: string;
  readonly columns: readonly string[];
}

export type QueryResultExportFormat = "csv" | "json";

export interface DestructiveQueryConfirmation {
  readonly sql: string;
  readonly classification: StatementClassification;
}
