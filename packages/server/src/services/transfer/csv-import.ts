import {
  CSV_IMPORT_MAX_COLUMNS,
  CSV_IMPORT_MAX_ERRORS,
  CSV_IMPORT_MAX_FILE_BYTES,
  CSV_IMPORT_MAX_ROWS,
  CSV_IMPORT_PREVIEW_ROWS,
  DATABASE_ENGINES
} from "@qyre/core";
import type {
  CsvImportInspection,
  CsvImportMapping,
  CsvImportMode,
  CsvImportPreviewRow,
  CsvImportResult,
  CsvImportRowError,
  MutationOp,
  TableMetadata
} from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { isExactNumericText } from "@qyre/core/mutation-editor-values";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { parse } from "csv-parse";
import type { Info } from "csv-parse";
import type { Readable } from "node:stream";
import { assertMutable, mongoInsertNumber } from "../rows/row-mutation-validation.js";

type ParsedRecord = { record: string[]; info: Info };
type ResolvedMapping = Array<{ sourceIndex: number; target: TableMetadata["columns"][number] }>;
type PendingInsert = { line: number; op: Extract<MutationOp, { type: "insert" }> };

function requestError(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode });
}

function rowError(line: number, column: string, message: string): Error {
  return Object.assign(new Error(message), { line, column });
}

function resolveMapping(
  headers: string[],
  mapping: CsvImportMapping | undefined,
  table: TableMetadata,
  engine: DatabaseAdapter["engine"]
): ResolvedMapping {
  if (!mapping) throw requestError("mapping is required for validate and import modes.");

  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const columns = new Map(table.columns.map((column) => [column.name, column]));
  const targets = new Set<string>();
  const resolved: ResolvedMapping = [];

  for (const [source, targetName] of Object.entries(mapping)) {
    if (!headerIndexes.has(source)) throw requestError(`Unknown CSV column "${source}".`);
    if (targetName === null) continue;
    const target = columns.get(targetName);
    if (!target) throw requestError(`Unknown target column "${targetName}".`);
    const kind = classifyFilterColumnKind(target.dataType, engine);
    if (["structured", "binary", "unknown", "null"].includes(kind)) {
      throw requestError(`Target column "${targetName}" (${kind}) cannot be imported from CSV.`);
    }
    if (targets.has(targetName)) {
      throw requestError(`Target column "${targetName}" is mapped more than once.`);
    }
    targets.add(targetName);
    resolved.push({ sourceIndex: headerIndexes.get(source)!, target });
  }

  if (resolved.length === 0) throw requestError("Map at least one CSV column before continuing.");
  return resolved;
}

/** Normalizes a validated decimal literal so equal values compare equal as strings. */
function canonicalDecimal(text: string): string {
  const [, sign = "", whole = "", fraction = "", exponent = "0"] =
    /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text) ?? [];
  const digits = `${whole}${fraction}`.replace(/^0+/, "");
  if (digits === "") return "0";
  const significant = digits.replace(/0+$/, "");
  const scale =
    BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length);
  return `${sign === "-" ? "-" : ""}${significant}e${scale}`;
}

function coerceCsvValue(
  rawValue: string,
  column: TableMetadata["columns"][number],
  engine: DatabaseAdapter["engine"],
  line: number
): unknown {
  if (rawValue === "" && column.nullable) return null;

  const kind = classifyFilterColumnKind(column.dataType, engine);
  const trimmed = rawValue.trim();
  switch (kind) {
    case "text":
    case "identifier":
      return rawValue;
    case "numeric": {
      if (!isExactNumericText(trimmed)) {
        throw rowError(line, column.name, `Column "${column.name}" expects a number.`);
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        throw rowError(line, column.name, `Column "${column.name}" expects a finite number.`);
      }
      if (engine === DATABASE_ENGINES.mongodb) return mongoInsertNumber(trimmed, column.name);
      // Integer columns reject text such as "1.0" or "1e3", so send a number whenever it is exact.
      return canonicalDecimal(String(value)) === canonicalDecimal(trimmed) ? value : trimmed;
    }
    case "boolean":
      if (/^(true|1)$/i.test(trimmed)) return true;
      if (/^(false|0)$/i.test(trimmed)) return false;
      throw rowError(line, column.name, `Column "${column.name}" expects true, false, 1, or 0.`);
    case "date":
    case "time":
    case "datetime":
      if (
        trimmed === "" ||
        (kind === "time"
          ? !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:z|[+-]\d{2}:\d{2})?$/i.test(trimmed)
          : Number.isNaN(new Date(trimmed).getTime()))
      ) {
        throw rowError(
          line,
          column.name,
          `Column "${column.name}" expects an ISO-8601 date/time value.`
        );
      }
      return engine === DATABASE_ENGINES.mongodb ? { $date: trimmed } : trimmed;
    case "objectId":
      if (!/^[0-9a-f]{24}$/i.test(trimmed)) {
        throw rowError(
          line,
          column.name,
          `Column "${column.name}" expects a 24-character hex ObjectId.`
        );
      }
      return engine === DATABASE_ENGINES.mongodb ? { $oid: trimmed } : trimmed;
    case "null":
    case "structured":
    case "binary":
    case "unknown":
      throw rowError(
        line,
        column.name,
        `Column "${column.name}" (${kind}) cannot be imported from CSV.`
      );
  }
}

function coerceRecord(
  record: string[],
  mapping: ResolvedMapping,
  engine: DatabaseAdapter["engine"],
  line: number
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const { sourceIndex, target } of mapping) {
    const rawValue = record[sourceIndex];
    if (rawValue === undefined) {
      throw rowError(line, target.name, `Column "${target.name}" is missing from this CSV row.`);
    }
    values[target.name] = coerceCsvValue(rawValue, target, engine, line);
  }
  return values;
}

function rawPreview(headers: string[], record: string[], line: number): CsvImportPreviewRow {
  return {
    line,
    values: Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]))
  };
}

function createErrorSink(maxEntries: number): {
  push(error: CsvImportRowError): void;
  /** Keeps a whole-import failure visible even when row errors already filled the list. */
  pushFirst(error: CsvImportRowError): void;
  readonly entries: CsvImportRowError[];
  count: number;
} {
  const entries: CsvImportRowError[] = [];
  return {
    count: 0,
    push(error) {
      this.count += 1;
      if (entries.length < maxEntries) entries.push(error);
    },
    pushFirst(error) {
      this.count += 1;
      entries.unshift(error);
      if (entries.length > maxEntries) entries.pop();
    },
    entries
  };
}

/** Inserts every pending row in one transaction; a rejected row rolls back the whole file. */
async function commitSqlImport(
  db: DatabaseAdapter,
  pending: PendingInsert[],
  errors: ReturnType<typeof createErrorSink>
): Promise<number> {
  if (pending.length === 0) return 0;
  const result = await db.mutations!.commitBatch!(pending.map(({ op }) => op));
  if (result.committed) return pending.length;

  const failed = pending[result.failedIndex] ?? pending[0]!;
  errors.pushFirst({
    line: failed.line,
    message: "The database rejected this row; the import was rolled back and no rows were written."
  });
  return 0;
}

/** MongoDB standalone has no multi-document transactions, so each document commits on its own. */
async function insertMongoDocuments(
  db: DatabaseAdapter,
  schema: string,
  tableName: string,
  pending: PendingInsert[],
  errors: ReturnType<typeof createErrorSink>
): Promise<number> {
  let inserted = 0;
  for (const { line, op } of pending) {
    try {
      await db.mutations!.insertRow!(schema, tableName, op.values);
      inserted += 1;
    } catch (error) {
      if (inserted === 0 && db.classifyPermissionDenied(error)) throw error;
      errors.push({
        line,
        message: "The database rejected this row; other rows were still inserted."
      });
    }
  }
  return inserted;
}

function isTruncated(input: Readable): boolean {
  return (input as Readable & { truncated?: boolean }).truncated === true;
}

function fileTooLarge(): Error {
  return requestError(
    `The CSV file exceeds the ${CSV_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MiB limit.`,
    413
  );
}

/**
 * Parses and validates the whole upload before writing. Malformed, truncated, or over-limit
 * files are rejected with no rows written; SQL engines then insert all valid rows atomically.
 */
export async function processCsvImport(
  db: DatabaseAdapter,
  schema: string,
  tableName: string,
  mode: CsvImportMode,
  mapping: CsvImportMapping | undefined,
  input: Readable
): Promise<CsvImportInspection | CsvImportResult> {
  const table = await db.getTable(schema, tableName);
  assertMutable(table, "insert");
  if (!db.mutations?.insertRow) {
    throw requestError("This engine does not support row inserts.");
  }
  if (db.engine !== DATABASE_ENGINES.mongodb && !db.mutations.commitBatch) {
    throw requestError("This engine does not support transactional imports.");
  }

  const parser = input.pipe(
    parse({
      bom: true,
      info: true,
      max_record_size: 1024 * 1024,
      relax_column_count: false,
      skip_empty_lines: true
    })
  );

  let headers: string[] | undefined;
  let resolvedMapping: ResolvedMapping | undefined;
  let rowCount = 0;
  let validRows = 0;
  const preview: CsvImportPreviewRow[] = [];
  const errors = createErrorSink(CSV_IMPORT_MAX_ERRORS);
  const pending: PendingInsert[] = [];

  try {
    for await (const parsed of parser as AsyncIterable<ParsedRecord>) {
      if (!headers) {
        headers = parsed.record;
        if (headers.length === 0 || headers.some((header) => header === "")) {
          throw requestError("CSV header names must be non-empty.");
        }
        if (headers.length > CSV_IMPORT_MAX_COLUMNS) {
          throw requestError(
            `CSV files may contain at most ${CSV_IMPORT_MAX_COLUMNS} columns.`,
            413
          );
        }
        if (new Set(headers).size !== headers.length) {
          throw requestError("CSV header names must be unique.");
        }
        if (mode !== "inspect")
          resolvedMapping = resolveMapping(headers, mapping, table, db.engine);
        continue;
      }

      rowCount += 1;
      if (rowCount > CSV_IMPORT_MAX_ROWS) {
        throw requestError(`CSV files may contain at most ${CSV_IMPORT_MAX_ROWS} data rows.`, 413);
      }
      const line = parsed.info.lines;

      if (mode === "inspect") {
        if (preview.length < CSV_IMPORT_PREVIEW_ROWS) {
          preview.push(rawPreview(headers, parsed.record, line));
        }
        continue;
      }

      let values: Record<string, unknown>;
      try {
        values = coerceRecord(parsed.record, resolvedMapping!, db.engine, line);
      } catch (error) {
        const detail = error as Error & { line?: number; column?: string };
        errors.push({
          line: detail.line ?? line,
          ...(detail.column ? { column: detail.column } : {}),
          message: detail.message
        });
        continue;
      }

      validRows += 1;
      if (preview.length < CSV_IMPORT_PREVIEW_ROWS) preview.push({ line, values });
      if (mode === "import") {
        pending.push({ line, op: { type: "insert", schema, table: tableName, values } });
      }
    }
    // A size-truncated upload can still end in a syntactically valid partial record.
    if (isTruncated(input)) throw fileTooLarge();
    if (!headers) throw requestError("The CSV file is empty.");
  } catch (error) {
    input.destroy();
    parser.destroy();
    const detail = error as Error & { code?: string; statusCode?: number };
    if (detail.statusCode) throw detail;
    if (isTruncated(input)) throw fileTooLarge();
    if (detail.code?.startsWith("CSV_")) {
      throw requestError(`Invalid CSV: ${detail.message}`);
    }
    throw detail;
  }

  if (mode === "inspect") return { mode, headers, rowCount, preview };

  let insertedRows = 0;
  if (mode === "import") {
    insertedRows =
      db.engine === DATABASE_ENGINES.mongodb
        ? await insertMongoDocuments(db, schema, tableName, pending, errors)
        : await commitSqlImport(db, pending, errors);
  }
  return {
    mode,
    rowCount,
    validRows,
    insertedRows,
    failedRows: mode === "validate" ? errors.count : rowCount - insertedRows,
    preview,
    errors: errors.entries
  };
}
