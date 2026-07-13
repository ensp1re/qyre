import {
  CSV_IMPORT_MAX_COLUMNS,
  CSV_IMPORT_MAX_ROWS,
  CSV_IMPORT_PREVIEW_ROWS,
  CSV_IMPORT_SQL_BATCH_SIZE
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
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { parse } from "csv-parse";
import type { Info } from "csv-parse";
import type { Readable } from "node:stream";
import { assertMutable } from "./row-mutation-validation.js";

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
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
        throw rowError(line, column.name, `Column "${column.name}" expects a number.`);
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        throw rowError(line, column.name, `Column "${column.name}" expects a finite number.`);
      }
      return value;
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
      return engine === "mongodb" ? { $date: trimmed } : trimmed;
    case "objectId":
      if (!/^[0-9a-f]{24}$/i.test(trimmed)) {
        throw rowError(
          line,
          column.name,
          `Column "${column.name}" expects a 24-character hex ObjectId.`
        );
      }
      return engine === "mongodb" ? { $oid: trimmed } : trimmed;
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

async function commitSqlBatch(
  db: DatabaseAdapter,
  batch: PendingInsert[],
  errors: CsvImportRowError[]
): Promise<number> {
  const result = await db.mutations!.commitBatch!(batch.map(({ op }) => op));
  if (result.committed) return batch.length;

  const failed = batch[result.failedIndex] ?? batch[0];
  for (const item of batch) {
    errors.push({
      line: item.line,
      message:
        item === failed
          ? "The database rejected this row; its batch was rolled back."
          : `This row was rolled back because line ${failed?.line ?? item.line} failed in the same batch.`
    });
  }
  return 0;
}

/**
 * Streams, validates, and optionally imports one CSV upload. It retains only the preview, bounded
 * error list, and current insert batch; the file itself is never buffered or written to disk.
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
  if (db.engine !== "mongodb" && !db.mutations.commitBatch) {
    throw requestError("This engine does not support transactional import batches.");
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
  let insertedRows = 0;
  const preview: CsvImportPreviewRow[] = [];
  const errors: CsvImportRowError[] = [];
  let batch: PendingInsert[] = [];

  async function flushBatch(): Promise<void> {
    if (batch.length === 0) return;
    insertedRows += await commitSqlBatch(db, batch, errors);
    batch = [];
  }

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
      if (mode === "validate") continue;

      if (db.engine === "mongodb") {
        try {
          await db.mutations.insertRow(schema, tableName, values);
          insertedRows += 1;
        } catch {
          errors.push({ line, message: "The database rejected this row." });
        }
        continue;
      }

      batch.push({ line, op: { type: "insert", schema, table: tableName, values } });
      if (batch.length === CSV_IMPORT_SQL_BATCH_SIZE) await flushBatch();
    }
    if (!headers) throw requestError("The CSV file is empty.");
    if (mode === "import" && db.engine !== "mongodb") await flushBatch();
  } catch (error) {
    input.destroy();
    parser.destroy();
    const detail = error as Error & { code?: string; statusCode?: number };
    if (detail.statusCode) throw detail;
    if (detail.code?.startsWith("CSV_")) {
      throw requestError(`Invalid CSV: ${detail.message}`);
    }
    throw detail;
  }

  if (mode === "inspect") return { mode, headers, rowCount, preview };
  return {
    mode,
    rowCount,
    validRows,
    insertedRows,
    failedRows: mode === "validate" ? errors.length : rowCount - insertedRows,
    preview,
    errors
  };
}
