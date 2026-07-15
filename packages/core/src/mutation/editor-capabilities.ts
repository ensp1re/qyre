import type { DatabaseEngine } from "../types/connection/connection.js";

export type MutationEditorKind =
  | "text"
  | "identifier"
  | "numeric"
  | "boolean"
  | "date"
  | "time"
  | "timestamp-local"
  | "timestamp-time-zone"
  | "enum"
  | "set"
  | "structured"
  | "binary"
  | "unknown"
  | "null"
  | "object-id";

export type MutationEditorWidget = "text" | "number" | "boolean" | "date";

export interface MutationEditorCapability {
  readonly kind: MutationEditorKind;
  readonly editable: boolean;
  readonly widget: MutationEditorWidget | null;
  readonly unavailableReason?: string;
}

const TEMPORAL_UNAVAILABLE =
  "Time and timestamp editing is temporarily unavailable so Qyre cannot discard seconds, fractional precision, or timezone information.";

function available(
  kind: MutationEditorKind,
  widget: MutationEditorWidget
): MutationEditorCapability {
  return { kind, editable: true, widget };
}

function unavailable(
  kind: MutationEditorKind,
  unavailableReason: string
): MutationEditorCapability {
  return { kind, editable: false, widget: null, unavailableReason };
}

/**
 * Classifies a database column for mutation authoring. This intentionally does not reuse the
 * filter classifier: accepting a coarse search value is different from safely replacing stored
 * data. Unsupported kinds fail closed and carry a user-facing reason.
 */
export function mutationEditorCapability(
  dataType: string,
  engine?: DatabaseEngine
): MutationEditorCapability {
  const type = dataType.trim().toLowerCase();

  if (engine === "mongodb") {
    if (type === "objectid") {
      return unavailable("object-id", "MongoDB values are edited in the document editor.");
    }
    return unavailable("unknown", "MongoDB values are edited in the document editor.");
  }

  if (type === "null") return unavailable("null", "A NULL-only column has no scalar editor.");
  if (type === "uuid") return available("identifier", "text");

  if (type.includes("enum")) return available("enum", "text");
  if (type.includes("set")) return available("set", "text");

  if (type.startsWith("timestamp") || type.startsWith("datetime")) {
    const hasTimeZone =
      type.includes("with time zone") || type.includes("timezone") || type.includes("timestamptz");
    return unavailable(
      hasTimeZone ? "timestamp-time-zone" : "timestamp-local",
      TEMPORAL_UNAVAILABLE
    );
  }
  if (type.startsWith("time")) return unavailable("time", TEMPORAL_UNAVAILABLE);
  if (type.startsWith("date")) return available("date", "date");

  if (
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("array") ||
    type.endsWith("[]")
  ) {
    return unavailable("structured", "Structured values need a dedicated validated editor.");
  }
  if (type.includes("blob") || type.includes("binary") || type.includes("bytea")) {
    return unavailable("binary", "Binary values do not yet have a safe mutation editor.");
  }

  if (type.includes("char") || type.includes("text") || type.includes("clob")) {
    return available("text", "text");
  }
  if (
    type.includes("int") ||
    type.includes("serial") ||
    type.includes("numeric") ||
    type.includes("decimal") ||
    type.includes("number") ||
    type.includes("float") ||
    type.includes("double") ||
    type.includes("real") ||
    type.includes("money")
  ) {
    return available("numeric", "number");
  }
  if (type.includes("bool")) return available("boolean", "boolean");

  return unavailable("unknown", "Qyre cannot safely edit this database type yet.");
}
