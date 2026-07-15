import type { JsonExportMode, RowExportFormat } from "@qyre/core";
import { formatCell } from "../../primitives/format-cell.js";

export const ROW_HEIGHT_ESTIMATE = 30;

const FORMULA_LEADING_CHARS = /^[=+\-@]/;
export const DEFAULT_EXPORT_FORMATS: readonly RowExportFormat[] = ["csv"];

export function exportFormatLabel(format: RowExportFormat, jsonMode: JsonExportMode): string {
  if (format === "csv") return "CSV";
  if (format === "json") return jsonMode === "extended-json" ? "Extended JSON" : "JSON";
  return "SQL INSERT";
}

/** Used by the selected-rows "Copy as CSV" action only (F066 moved the whole-table export
 * server-side - see onExportAllRows) - copying a hand-picked subset of currently-loaded rows still
 * makes sense entirely client-side. */
export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    const text = formatCell(value);
    // Prefix a leading apostrophe so Excel/Sheets treats a value like `=cmd()` as text, not a
    // formula - CSV export can otherwise be used to inject formulas into the analyst's spreadsheet.
    const safeText = FORMULA_LEADING_CHARS.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  return lines.join("\n");
}

/** Stable identity for a row, derived from its primary-key column values (F103) - how a staged
 * edit is matched back to the same logical row regardless of page/sort/filter changes. Mirrors
 * `apps/web/src/features/table/model/editing/pending-changes.ts`'s `computeRowKey` exactly (packages/ui
 * can't depend on apps/web, and this is small enough that duplicating it beats a shared package for
 * three lines) - both sides must stay in sync if the shape ever changes. */
export function computeRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: readonly string[]
): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}

/** A page of table rows: client-side search over the fetched page, plus server-driven sort (F065)
 * and pagination. */
