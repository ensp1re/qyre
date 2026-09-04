import type { JsonExportMode, RowExportFormat } from "@qyre/core";
import { formatCell } from "../../primitives/format-cell.js";

export const ROW_HEIGHT_ESTIMATE = 30;

// Keep spreadsheet apps from executing formula-like exported values.
const FORMULA_LEADING_CHARS = /^\s*[=+\-@]/;
export const DEFAULT_EXPORT_FORMATS: readonly RowExportFormat[] = ["csv"];

export function exportFormatLabel(format: RowExportFormat, jsonMode: JsonExportMode): string {
  if (format === "csv") return "CSV";
  if (format === "json") return jsonMode === "extended-json" ? "Extended JSON" : "JSON";
  return "SQL INSERT";
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    const text = formatCell(value);
    const safeText = FORMULA_LEADING_CHARS.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  return lines.join("\n");
}

export function computeRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: readonly string[]
): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}
