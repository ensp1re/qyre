export const CSV_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 10_000;
export const CSV_IMPORT_MAX_COLUMNS = 256;
export const CSV_IMPORT_MAX_FIELD_BYTES = 64 * 1024;
export const CSV_IMPORT_PREVIEW_ROWS = 20;
export const CSV_IMPORT_SQL_BATCH_SIZE = 250;
/** Above this many per-row errors (F136 review finding V3), the server stops appending further
 * entries to `CsvImportResult.errors` - a fully-invalid `CSV_IMPORT_MAX_ROWS`-row file would
 * otherwise return a 10,000-entry array in one JSON response. `failedRows` still reports the true
 * total; the client compares `errors.length` against it to know the list was truncated. */
export const CSV_IMPORT_MAX_ERRORS = 100;

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
