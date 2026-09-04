import type { DateTimeInputKind } from "./date-time-types.js";

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function formatCellDisplay(value: unknown, dataType?: string): string {
  if (dataType?.toLowerCase().startsWith("bool") && (value === 0 || value === 1)) {
    return value === 1 ? "true" : "false";
  }
  return formatCell(value);
}

export function isDateType(dataType: string): boolean {
  const type = dataType.toLowerCase();
  return type.startsWith("timestamp") || type.startsWith("date") || type.startsWith("time");
}

export function isClickableDateType(dataType: string): boolean {
  const type = dataType.toLowerCase();
  if (type.startsWith("timestamp") || type.startsWith("datetime")) return true;
  if (type.startsWith("time")) return false;
  return type.startsWith("date");
}

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

export function dateInputKind(dataType: string): DateTimeInputKind | null {
  const type = dataType.toLowerCase();
  if (type.startsWith("timestamp") || type.startsWith("datetime")) return "datetime-local";
  if (type.startsWith("time")) return "time";
  if (type.startsWith("date")) return "date";
  return null;
}
