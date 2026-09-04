import type { DatabaseEngine } from "../types/connection/connection.js";
import type { MutationEditorCapability, MutationEditorMetadata } from "./editor-capabilities.js";

export type MutationValueResult =
  | { readonly valid: true; readonly value: unknown }
  | { readonly valid: false; readonly error: string };

const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?$/;
// Accept PostgreSQL's whole-hour offsets without normalizing through Date.
const OFFSET = /(?:Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)$/i;
const MYSQL_TIME = /^-?(?:(?:\d{1,2}|[0-7]\d{2}|8[0-2]\d|83[0-8])):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/;
const BIT_STRING = /^[01]+$/;
const BINARY_HEX = /^(?:[0-9a-f]{2})*$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function normalizedBinaryHex(value: string): string {
  return value
    .trim()
    .replace(/^(?:\\x|0x)/i, "")
    .replace(/\s+/g, "");
}

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

function intervalObjectText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const interval = value as Record<string, unknown>;
  if (typeof interval.toPostgres === "function") {
    const text = interval.toPostgres.call(value);
    if (typeof text === "string") return text;
  }

  const fields = ["years", "months", "days", "hours", "minutes"] as const;
  const knownFields = [...fields, "seconds", "milliseconds"];
  if (!knownFields.some((field) => Object.prototype.hasOwnProperty.call(interval, field))) {
    return undefined;
  }
  if (
    knownFields.some(
      (field) =>
        interval[field] !== undefined &&
        (typeof interval[field] !== "number" || !Number.isFinite(interval[field]))
    )
  ) {
    return undefined;
  }

  const parts = fields.flatMap((field) => {
    const amount = (interval[field] as number | undefined) ?? 0;
    return amount === 0 ? [] : [`${amount} ${field}`];
  });
  const seconds =
    ((interval.seconds as number | undefined) ?? 0) +
    ((interval.milliseconds as number | undefined) ?? 0) / 1000;
  if (seconds !== 0) {
    parts.push(`${seconds.toFixed(6).replace(/\.?0+$/, "")} seconds`);
  }
  return parts.join(" ") || "0";
}

export function mutationValueText(value: unknown, capability: MutationEditorCapability): string {
  if (value === undefined) {
    const bsonTemplate =
      capability.kind === "bson-regex"
        ? { pattern: "", options: "" }
        : capability.kind === "bson-timestamp"
          ? { t: 0, i: 0 }
          : capability.kind === "bson-code"
            ? { code: "", scope: {} }
            : capability.kind === "bson-min-key"
              ? { $minKey: 1 }
              : capability.kind === "bson-max-key"
                ? { $maxKey: 1 }
                : undefined;
    if (bsonTemplate) return JSON.stringify(bsonTemplate, null, 2);
  }
  if (value === null || value === undefined) return "";
  if (capability.kind === "interval") {
    const text = intervalObjectText(value);
    if (text !== undefined) return text;
  }
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

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validBsonRegexOptions(options: string): boolean {
  return /^[ilmsux]*$/.test(options) && new Set(options).size === options.length;
}

function uint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
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
    case "interval":
      return typeof value === "string" && value.trim().length > 0
        ? { valid: true, value }
        : invalid("Enter a PostgreSQL interval value.");
    case "bit-string":
      return typeof value === "string" && BIT_STRING.test(value)
        ? { valid: true, value }
        : invalid("Use only 0 and 1, with at least one digit.");
    case "identifier":
      if (typeof value !== "string" || !UUID.test(value)) return invalid("Enter a valid UUID.");
      return { valid: true, value };
    case "object-id":
      return typeof value === "string" && OBJECT_ID.test(value)
        ? { valid: true, value: value.toLowerCase() }
        : invalid("Enter a 24-character hexadecimal ObjectId.");
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
              : "Use HH:MM[:SS[.fraction]][Z|±HH|±HHMM|±HH:MM]."
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
    case "bson-regex": {
      const regex = recordValue(value);
      return regex &&
        hasOnlyKeys(regex, ["pattern", "options"]) &&
        typeof regex.pattern === "string" &&
        typeof regex.options === "string" &&
        validBsonRegexOptions(regex.options)
        ? { valid: true, value }
        : invalid('Use {"pattern":"...","options":"im"} with valid BSON regex options.');
    }
    case "bson-timestamp": {
      const timestamp = recordValue(value);
      return timestamp &&
        hasOnlyKeys(timestamp, ["t", "i"]) &&
        uint32(timestamp.t) &&
        uint32(timestamp.i)
        ? { valid: true, value }
        : invalid('Use {"t":<uint32>,"i":<uint32>} for the BSON timestamp.');
    }
    case "bson-code": {
      const code = recordValue(value);
      const scope = code?.scope;
      return code &&
        hasOnlyKeys(code, ["code", "scope"]) &&
        typeof code.code === "string" &&
        (scope === undefined || recordValue(scope) !== undefined)
        ? { valid: true, value }
        : invalid('Use {"code":"...","scope":{}}; scope is optional and must be an object.');
    }
    case "bson-min-key": {
      const minKey = recordValue(value);
      return minKey && hasOnlyKeys(minKey, ["$minKey"]) && minKey.$minKey === 1
        ? { valid: true, value }
        : invalid('Use {"$minKey":1}.');
    }
    case "bson-max-key": {
      const maxKey = recordValue(value);
      return maxKey && hasOnlyKeys(maxKey, ["$maxKey"]) && maxKey.$maxKey === 1
        ? { valid: true, value }
        : invalid('Use {"$maxKey":1}.');
    }
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
      const normalized = normalizedBinaryHex(value);
      return BINARY_HEX.test(normalized)
        ? { valid: true, value: normalized.toLowerCase() }
        : invalid("Use an even number of hexadecimal digits (0-9, A-F); spaces are allowed.");
    }
    case "null":
    case "unknown":
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
