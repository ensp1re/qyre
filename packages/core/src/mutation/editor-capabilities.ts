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
  | "bit-string"
  | "network"
  | "xml"
  | "unknown"
  | "null"
  | "object-id";

export type MutationEditorWidget =
  | "text"
  | "multiline"
  | "decimal"
  | "boolean"
  | "date"
  | "time"
  | "timestamp"
  | "enum"
  | "set"
  | "json"
  | "array"
  | "binary"
  | "xml";

export interface MutationEditorMetadata {
  readonly allowedValues?: readonly string[];
  readonly elementDataType?: string;
}

export interface MutationEditorCapability {
  readonly kind: MutationEditorKind;
  readonly editable: boolean;
  readonly widget: MutationEditorWidget | null;
  readonly unavailableReason?: string;
}

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
  engine?: DatabaseEngine,
  metadata: MutationEditorMetadata = {}
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

  if (type.includes("set")) {
    return metadata.allowedValues?.length
      ? available("set", "set")
      : unavailable("set", "Set options are unavailable from engine metadata.");
  }
  if (metadata.allowedValues?.length || type.includes("enum")) {
    return metadata.allowedValues?.length
      ? available("enum", "enum")
      : unavailable("enum", "Enum options are unavailable from engine metadata.");
  }

  if (type.startsWith("timestamp") || type.startsWith("datetime")) {
    const hasTimeZone =
      type.includes("with time zone") || type.includes("timezone") || type.includes("timestamptz");
    return available(hasTimeZone ? "timestamp-time-zone" : "timestamp-local", "timestamp");
  }
  if (type.startsWith("time")) return available("time", "time");
  if (type.startsWith("date")) return available("date", "date");

  if (type.includes("json")) return available("structured", "json");
  if (metadata.elementDataType || type.includes("array") || type.endsWith("[]")) {
    return engine === "postgres"
      ? available("structured", "array")
      : unavailable("structured", "Native array editing is supported only for PostgreSQL.");
  }
  if (type.includes("xml")) {
    return available("xml", "xml");
  }
  if (type.includes("blob") || type.includes("binary") || type.includes("bytea")) {
    return available("binary", "binary");
  }
  if (
    engine === "postgres" &&
    (type === "bit" ||
      type.startsWith("bit(") ||
      type.startsWith("bit varying") ||
      type === "varbit" ||
      type.startsWith("varbit("))
  ) {
    return available("bit-string", "text");
  }
  if (
    engine === "postgres" &&
    (type === "inet" || type === "cidr" || type === "macaddr" || type === "macaddr8")
  ) {
    return available("network", "text");
  }

  if (type.includes("char") || type.includes("text") || type.includes("clob")) {
    return available(
      "text",
      type === "text" || type.includes("clob") || type.includes("longtext") ? "multiline" : "text"
    );
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
    return available("numeric", "decimal");
  }
  if (type.includes("bool")) return available("boolean", "boolean");

  return unavailable("unknown", "Qyre cannot safely edit this database type yet.");
}
