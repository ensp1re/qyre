import { DATABASE_ENGINES } from "../constants/connection.js";
import type { DatabaseEngine } from "../types/connection/connection.js";
import type {
  MutationEditorCapability,
  MutationEditorKind,
  MutationEditorMetadata,
  MutationEditorWidget
} from "./types.js";

export type {
  MutationEditorCapability,
  MutationEditorKind,
  MutationEditorMetadata,
  MutationEditorWidget
} from "./types.js";

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

/** Classify a column for editing; unsupported kinds fail closed. */
export function mutationEditorCapability(
  dataType: string,
  engine?: DatabaseEngine,
  metadata: MutationEditorMetadata = {}
): MutationEditorCapability {
  const type = dataType.trim().toLowerCase();

  if (engine === DATABASE_ENGINES.mongodb) {
    if (type === "objectid") return available("object-id", "text");
    if (type === "string") return available("text", "text");
    if (type === "number") return available("numeric", "decimal");
    if (type === "boolean") return available("boolean", "boolean");
    if (type === "date") return available("timestamp-time-zone", "timestamp");
    if (type === "array") return available("structured", "array");
    if (type === "object") return available("structured", "json");
    if (type === "binary") return available("binary", "binary");
    if (type === "regex") return available("bson-regex", "json");
    if (type === "timestamp") return available("bson-timestamp", "json");
    if (type === "code") return available("bson-code", "json");
    if (type === "minkey") return available("bson-min-key", "json");
    if (type === "maxkey") return available("bson-max-key", "json");
    if (type === "null")
      return unavailable("null", "A null-only sampled field has no type-safe editor.");
    return unavailable("unknown", "This sampled MongoDB field has mixed or unsupported types.");
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
  if (engine === DATABASE_ENGINES.postgres && type === "interval")
    return available("interval", "interval");

  if (type.includes("json")) return available("structured", "json");
  if (metadata.elementDataType || type.includes("array") || type.endsWith("[]")) {
    return engine === DATABASE_ENGINES.postgres
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
    engine === DATABASE_ENGINES.postgres &&
    (type === "bit" ||
      type.startsWith("bit(") ||
      type.startsWith("bit varying") ||
      type === "varbit" ||
      type.startsWith("varbit("))
  ) {
    return available("bit-string", "text");
  }
  if (
    engine === DATABASE_ENGINES.postgres &&
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
