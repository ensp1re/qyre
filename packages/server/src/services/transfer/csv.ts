/**
 * CSV line formatting for `GET /api/tables/:schema/:table/export.csv` (F118). Deliberately
 * independent from `packages/ui`'s `toCsv`/`formatCell` (used by RowsTable's "Copy as CSV") rather
 * than shared via `@qyre/core` - this package can't depend on `packages/ui` (see
 * ARCHITECTURE.md's layer model), and a real (non-type) shared export from `@qyre/core`'s barrel
 * has previously broken `apps/web`'s Vite build by dragging in Node-only modules (F047's history).
 * This is a small enough function that duplicating it here is simpler than a new shared package.
 */
// Leading whitespace is part of the guard, not noise before it: Excel and Sheets strip a leading
// tab/CR/space on import and then evaluate what follows, so `\t=cmd()` is as live a formula as
// `=cmd()` (F154). Anchoring on the bare character missed every whitespace-prefixed variant.
const FORMULA_LEADING_CHARS = /^\s*[=+\-@]/;

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
  // `\r` belongs in the quote trigger alongside `\n`: a bare carriage return is a record separator
  // to Excel and to plenty of CSV parsers, so an unquoted value containing one silently splits the
  // row it sits in (F154).
  return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

/** One escaped, comma-joined CSV line (no trailing newline) for the given values. */
export function csvLine(values: readonly unknown[]): string {
  return values.map(escapeCsvField).join(",");
}
