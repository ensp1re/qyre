/** Format an arbitrary row cell value for display. Shared by RowsTable and QueryRunner. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Whether an engine-reported `ColumnMetadata.dataType` is a date/timestamp/time type - shared by
 * TypeIcon (the header icon) and CellValue (F070's click-to-inspect date popover), so the two
 * agree on what counts as a date column. `dataType` is engine-reported text, not a normalized
 * enum: Postgres reports `information_schema` names ("timestamp with time zone"), SQLite reports
 * raw declared types ("TEXT", "REAL", or "any"). Prefix-matched case-insensitively.
 */
export function isDateType(dataType: string): boolean {
  const type = dataType.toLowerCase();
  return type.startsWith("timestamp") || type.startsWith("date") || type.startsWith("time");
}
