import type { RowExportFormat } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { csvLine } from "./csv.js";

function jsonStringify(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

export async function* formatRowExport(
  db: DatabaseAdapter,
  format: RowExportFormat,
  schema: string,
  table: string,
  columns: readonly string[],
  rows: AsyncIterable<Record<string, unknown>>
): AsyncIterable<string> {
  if (format === "csv") {
    yield `${csvLine(columns)}\n`;
    for await (const row of rows) {
      yield `${csvLine(columns.map((column) => row[column]))}\n`;
    }
    return;
  }

  if (format === "json") {
    let first = true;
    yield "[";
    for await (const row of rows) {
      yield `${first ? "\n" : ",\n"}${db.serializeJsonRow?.(row) ?? jsonStringify(row)}`;
      first = false;
    }
    yield first ? "]\n" : "\n]\n";
    return;
  }

  if (!db.formatSqlInsert) {
    throw Object.assign(new Error("This engine does not support SQL INSERT export."), {
      statusCode: 400
    });
  }
  for await (const row of rows) {
    yield `${db.formatSqlInsert(schema, table, columns, row)}\n`;
  }
}
