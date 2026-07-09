import type { ColumnMetadata } from "./types/table.js";
import type { FilterOp } from "./types/query.js";

export type FilterValueInput = "text" | "number" | "boolean" | "date" | "time" | "datetime-local";

export type FilterColumnKind =
  | "text"
  | "numeric"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "identifier"
  | "objectId"
  | "null"
  | "structured"
  | "binary"
  | "unknown";

export interface FilterCapability {
  readonly kind: FilterColumnKind;
  readonly label: string;
  readonly operators: readonly FilterOp[];
  readonly valueInput: FilterValueInput | null;
  readonly unavailableReason?: string;
}

const NULL_OPS: readonly FilterOp[] = ["isNull", "isNotNull"];

function withNullability(ops: readonly FilterOp[], column: ColumnMetadata): readonly FilterOp[] {
  return column.nullable ? [...ops, ...NULL_OPS] : ops;
}

export function classifyFilterColumnKind(dataType: string, engine?: string): FilterColumnKind {
  const type = dataType.trim().toLowerCase();

  if (engine === "mongodb") {
    if (type === "objectid") return "objectId";
    if (type === "string") return "text";
    if (type === "number") return "numeric";
    if (type === "boolean") return "boolean";
    if (type === "date") return "datetime";
    if (type === "null") return "null";
    if (type === "binary") return "binary";
    if (
      type === "object" ||
      type === "array" ||
      type === "mixed" ||
      type === "minkey" ||
      type === "maxkey"
    ) {
      return "structured";
    }
    return "unknown";
  }

  if (type === "uuid") return "identifier";
  if (
    type.includes("char") ||
    type.includes("text") ||
    type.includes("clob") ||
    type.includes("enum") ||
    type.includes("set")
  ) {
    return "text";
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
    return "numeric";
  }
  if (type.includes("bool")) return "boolean";
  if (type.startsWith("timestamp") || type.startsWith("datetime")) return "datetime";
  if (type.startsWith("time")) return "time";
  if (type.startsWith("date")) return "date";
  if (type.includes("json") || type.includes("xml") || type.includes("array")) return "structured";
  if (type.includes("blob") || type.includes("binary") || type.includes("bytea")) return "binary";
  if (type === "null") return "null";
  return "unknown";
}

export function filterCapabilityForColumn(
  column: ColumnMetadata,
  engine?: string
): FilterCapability {
  const kind = classifyFilterColumnKind(column.dataType, engine);

  switch (kind) {
    case "text":
      return {
        kind,
        label: "text",
        operators: withNullability(["contains", "eq", "neq"], column),
        valueInput: "text"
      };
    case "numeric":
      return {
        kind,
        label: "number",
        operators: withNullability(["eq", "neq", "gt", "gte", "lt", "lte"], column),
        valueInput: "number"
      };
    case "boolean":
      return {
        kind,
        label: "boolean",
        operators: withNullability(["eq", "neq"], column),
        valueInput: "boolean"
      };
    case "date":
      return {
        kind,
        label: "date",
        operators: withNullability(["eq", "neq", "gt", "gte", "lt", "lte"], column),
        valueInput: "date"
      };
    case "time":
      return {
        kind,
        label: "time",
        operators: withNullability(["eq", "neq", "gt", "gte", "lt", "lte"], column),
        valueInput: "time"
      };
    case "datetime":
      return {
        kind,
        label: "timestamp",
        operators: withNullability(["eq", "neq", "gt", "gte", "lt", "lte"], column),
        valueInput: "datetime-local"
      };
    case "identifier":
      return {
        kind,
        label: "identifier",
        operators: withNullability(["eq", "neq"], column),
        valueInput: "text"
      };
    case "objectId":
      return {
        kind,
        label: "ObjectId",
        operators: withNullability(["eq", "neq"], column),
        valueInput: "text"
      };
    case "null":
      return { kind, label: "null", operators: NULL_OPS, valueInput: null };
    case "structured":
      return {
        kind,
        label: "structured",
        operators: column.nullable ? NULL_OPS : [],
        valueInput: null,
        unavailableReason: column.nullable
          ? "Only null checks are available for structured values."
          : "Structured values need a dedicated query surface, not a scalar filter."
      };
    case "binary":
      return {
        kind,
        label: "binary",
        operators: column.nullable ? NULL_OPS : [],
        valueInput: null,
        unavailableReason: column.nullable
          ? "Only null checks are available for binary values."
          : "Binary values are not filterable from the table UI."
      };
    case "unknown":
      return {
        kind,
        label: "unknown",
        operators: withNullability(["eq", "neq"], column),
        valueInput: "text"
      };
  }
}

export function isFilterOpSupported(
  column: ColumnMetadata,
  op: FilterOp,
  engine?: string
): boolean {
  return filterCapabilityForColumn(column, engine).operators.includes(op);
}
