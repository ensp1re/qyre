/** Format an arbitrary row cell value for display. Shared by RowsTable and QueryRunner. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}
