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

/**
 * Whether a date/timestamp/time `dataType` (per `isDateType`) has an actual date component and can
 * be safely parsed by `new Date(...)` for CellValue's click-to-inspect popover. A bare TIME value
 * (e.g. "08:27:20") has no date component - `new Date("08:27:20")` doesn't parse, so TIME must be
 * excluded here even though it's still a date-ish type for `isDateType`/`TypeIcon` purposes (F081).
 */
export function isClickableDateType(dataType: string): boolean {
  const type = dataType.toLowerCase();
  if (type.startsWith("timestamp") || type.startsWith("datetime")) return true;
  if (type.startsWith("time")) return false;
  return type.startsWith("date");
}

/**
 * A short, human-readable label for a date-ish `ColumnMetadata.dataType`, replacing verbose engine-
 * reported strings (Postgres's "timestamp without time zone") with a clear one instead of leaking
 * the internal type string verbatim (F081). Returns `dataType` unchanged for non-date types.
 */
export function friendlyTypeLabel(dataType: string): string {
  const type = dataType.toLowerCase();
  const hasTimeZone = type.includes("with time zone") || type.includes("tz");
  if (type.startsWith("timestamp") || type.startsWith("datetime")) {
    return hasTimeZone ? "timestamp (tz)" : "timestamp";
  }
  if (type.startsWith("time")) return hasTimeZone ? "time (tz)" : "time";
  if (type.startsWith("date")) return "date";
  if (type === "bytea" || type.includes("blob") || type.includes("binary")) return "bytes";
  return dataType;
}

/**
 * Which native HTML date/time input best matches a date-ish `dataType`, or null for a non-date
 * type - drives FilterBar's value step (F082). TIME gets its own "time" picker rather than being
 * lumped in with DATE/TIMESTAMP's "date"/"datetime-local" pickers, the same TIME-has-no-date-
 * component distinction `isClickableDateType` draws for the click-to-inspect popover (F081).
 */
export function dateInputKind(dataType: string): "date" | "time" | "datetime-local" | null {
  const type = dataType.toLowerCase();
  if (type.startsWith("timestamp") || type.startsWith("datetime")) return "datetime-local";
  if (type.startsWith("time")) return "time";
  if (type.startsWith("date")) return "date";
  return null;
}
