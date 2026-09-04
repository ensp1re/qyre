// Leading whitespace is included because spreadsheet apps trim it before evaluating formulas.
const FORMULA_LEADING_CHARS = /^\s*[=+\-@]/;

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function escapeCsvField(value: unknown): string {
  const text = formatCsvValue(value);
  const safeText = FORMULA_LEADING_CHARS.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

export function csvLine(values: readonly unknown[]): string {
  return values.map(escapeCsvField).join(",");
}
