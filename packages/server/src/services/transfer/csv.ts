/**
 * CSV line formatting for `GET /api/tables/:schema/:table/export.csv` (F118). Deliberately
 * independent from `packages/ui`'s `toCsv`/`formatCell` (used by RowsTable's "Copy as CSV") rather
 * than shared via `@qyre/core` - this package can't depend on `packages/ui` (see
 * ARCHITECTURE.md's layer model), and a real (non-type) shared export from `@qyre/core`'s barrel
 * has previously broken `apps/web`'s Vite build by dragging in Node-only modules (F047's history).
 * This is a small enough function that duplicating it here is simpler than a new shared package.
 */
const FORMULA_LEADING_CHARS = /^[=+\-@]/;

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function escapeCsvField(value: unknown): string {
  const text = formatCsvValue(value);
  // Prefix a leading apostrophe so Excel/Sheets treats a value like `=cmd()` as text, not a
  // formula - CSV export can otherwise be used to inject formulas into the analyst's spreadsheet
  // (F035).
  const safeText = FORMULA_LEADING_CHARS.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

/** One escaped, comma-joined CSV line (no trailing newline) for the given values. */
export function csvLine(values: readonly unknown[]): string {
  return values.map(escapeCsvField).join(",");
}
