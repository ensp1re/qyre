export const CSV_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 10_000;
export const CSV_IMPORT_MAX_COLUMNS = 256;
export const CSV_IMPORT_MAX_FIELD_BYTES = 64 * 1024;
export const CSV_IMPORT_PREVIEW_ROWS = 20;
export const CSV_IMPORT_SQL_BATCH_SIZE = 250;

export type CsvImportMode = "inspect" | "validate" | "import";
export type CsvImportMapping = Record<string, string | null>;

export interface CsvImportPreviewRow {
  readonly line: number;
  readonly values: Record<string, unknown>;
}

export interface CsvImportRowError {
  readonly line: number;
  readonly column?: string;
  readonly message: string;
}

export interface CsvImportInspection {
  readonly mode: "inspect";
  readonly headers: string[];
  readonly rowCount: number;
  readonly preview: CsvImportPreviewRow[];
}

export interface CsvImportResult {
  readonly mode: "validate" | "import";
  readonly rowCount: number;
  readonly validRows: number;
  readonly insertedRows: number;
  readonly failedRows: number;
  readonly preview: CsvImportPreviewRow[];
  readonly errors: CsvImportRowError[];
}

export type CsvImportResponse = CsvImportInspection | CsvImportResult;
