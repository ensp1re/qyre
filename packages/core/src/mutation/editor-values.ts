import type { DatabaseEngine } from "../types/connection/connection.js";
import type { MutationEditorCapability, MutationEditorMetadata } from "./editor-capabilities.js";

export type MutationValueResult =
  | { readonly valid: true; readonly value: unknown }
  | { readonly valid: false; readonly error: string };

const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?$/;
const OFFSET = /(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i;
const MYSQL_TIME = /^-?(?:(?:\d{1,2}|[0-7]\d{2}|8[0-2]\d|83[0-8])):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/;
const BIT_STRING = /^[01]+$/;
const BINARY_HEX = /^(?:[0-9a-f]{2})*$/i;

function invalid(error: string): MutationValueResult {
  return { valid: false, error };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isExactNumericText(value: string): boolean {
  return EXACT_NUMBER.test(value.trim());
}

export function isExactDateText(value: string): boolean {
  const match = DATE.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isLocalTime(value: string): boolean {
  const match = LOCAL_TIME.exec(value);
  if (!match?.[1] || !match[2]) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  return hour <= 23 && minute <= 59 && second <= 59;
}

export function isExactTimeText(value: string, engine?: DatabaseEngine): boolean {
  if (engine === "mysql") return MYSQL_TIME.test(value);
  const withoutOffset = value.replace(OFFSET, "");
  return isLocalTime(withoutOffset);
}

export function isExactTimestampText(
  value: string,
  kind: "timestamp-local" | "timestamp-time-zone"
): boolean {
  const separator = value.includes("T") ? "T" : " ";
  const [date, time] = value.split(separator);
  if (!date || !time || !isExactDateText(date)) return false;
  const hasOffset = OFFSET.test(time);
  const localTime = time.replace(OFFSET, "");
  if (!isLocalTime(localTime)) return false;
  return kind === "timestamp-time-zone" ? hasOffset : !hasOffset;
}

export function jsonErrorWithLocation(error: unknown, source: string): string {
  const message = error instanceof Error ? error.message : "Invalid JSON.";
  const reportedPosition = /position (\d+)/i.exec(message)?.[1];
  const unexpectedToken = /Unexpected token '([^']+)'/i.exec(message)?.[1];
  const inferredPosition = unexpectedToken ? source.lastIndexOf(unexpectedToken) : -1;
  const offset = reportedPosition
    ? Number(reportedPosition)
    : /unexpected end/i.test(message)
      ? source.length
      : inferredPosition;
  if (offset < 0) return message;
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return `${message} (line ${line}, column ${column})`;
}

export function mutationValueText(value: unknown, capability: MutationEditorCapability): string {
  if (value === null || value === undefined) return "";
  if (
    capability.kind === "binary" &&
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "Buffer" &&
    "data" in value &&
    Array.isArray(value.data) &&
    value.data.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return value.data.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (capability.widget === "json" || capability.widget === "array") {
    if (typeof value === "string" && /^[[{]/.test(value.trim())) {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, null, 2);
  }
  if (capability.widget === "set" && Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

export function validateMutationValue(
  capability: MutationEditorCapability,
  value: unknown,
  engine?: DatabaseEngine,
  metadata: MutationEditorMetadata = {}
): MutationValueResult {
  switch (capability.kind) {
    case "text":
    case "network":
    case "xml":
      return typeof value === "string" ? { valid: true, value } : invalid("Expected text.");
    case "bit-string":
      return typeof value === "string" && BIT_STRING.test(value)
        ? { valid: true, value }
        : invalid("Use only 0 and 1, with at least one digit.");
    case "identifier":
      if (typeof value !== "string" || !UUID.test(value)) return invalid("Enter a valid UUID.");
      return { valid: true, value };
    case "numeric":
      if (typeof value === "number") {
        return Number.isFinite(value) ? { valid: true, value } : invalid("Enter a finite number.");
      }
      if (typeof value !== "string" || !isExactNumericText(value)) {
        return invalid("Enter an exact integer or decimal value.");
      }
      return { valid: true, value: value.trim() };
    case "boolean":
      return typeof value === "boolean" ? { valid: true, value } : invalid("Choose true or false.");
    case "date":
      return typeof value === "string" && isExactDateText(value)
        ? { valid: true, value }
        : invalid("Use YYYY-MM-DD with a valid calendar date.");
    case "time":
      return typeof value === "string" && isExactTimeText(value, engine)
        ? { valid: true, value }
        : invalid(
            engine === "mysql"
              ? "Use MySQL TIME format HH:MM:SS[.fraction], including an optional leading minus."
              : "Use HH:MM[:SS[.fraction]][Z|±HH:MM]."
          );
    case "timestamp-local":
    case "timestamp-time-zone":
      return typeof value === "string" && isExactTimestampText(value, capability.kind)
        ? { valid: true, value }
        : invalid(
            capability.kind === "timestamp-time-zone"
              ? "Use YYYY-MM-DD HH:MM[:SS[.fraction]] with Z or a numeric offset."
              : "Use YYYY-MM-DD HH:MM[:SS[.fraction]] without a timezone offset."
          );
    case "enum":
      return typeof value === "string" && metadata.allowedValues?.includes(value)
        ? { valid: true, value }
        : invalid("Choose one of the available values.");
    case "set":
      return Array.isArray(value) &&
        value.every(
          (member) => typeof member === "string" && metadata.allowedValues?.includes(member)
        )
        ? { valid: true, value }
        : invalid("Choose only available set values.");
    case "structured":
      if (capability.widget === "array" && !Array.isArray(value)) {
        return invalid("Enter a JSON array.");
      }
      try {
        JSON.stringify(value);
        return { valid: true, value };
      } catch {
        return invalid("Enter a JSON-serializable value.");
      }
    case "binary": {
      if (typeof value !== "string") return invalid("Enter bytes as hexadecimal text.");
      const normalized = value.trim().replace(/^\\x/i, "");
      return BINARY_HEX.test(normalized)
        ? { valid: true, value: normalized.toLowerCase() }
        : invalid("Use an even number of hexadecimal digits (0-9, A-F).");
    }
    case "null":
    case "unknown":
    case "object-id":
      return invalid(capability.unavailableReason ?? "This value is not editable.");
  }
}

export function parseMutationDraft(
  draft: string,
  capability: MutationEditorCapability,
  engine?: DatabaseEngine,
  metadata: MutationEditorMetadata = {}
): MutationValueResult {
  if (capability.widget === "json" || capability.widget === "array") {
    try {
      const value = JSON.parse(draft);
      return validateMutationValue(capability, value, engine, metadata);
    } catch (error) {
      return invalid(jsonErrorWithLocation(error, draft));
    }
  }
  if (capability.widget === "set") {
    try {
      return validateMutationValue(capability, JSON.parse(draft), engine, metadata);
    } catch (error) {
      return invalid(jsonErrorWithLocation(error, draft));
    }
  }
  return validateMutationValue(capability, draft, engine, metadata);
}
