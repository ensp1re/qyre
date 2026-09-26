import type { ColumnMetadata, RowFilter } from "@qyre/core";
import { isExactNumericText, parseTimestampInstant } from "@qyre/core/mutation-editor-values";
import { escapeRegExp, type ResolvedRowSearch } from "@qyre/driver-contract";
import { Decimal128, ObjectId } from "mongodb";
import { exactInteger, int64FromText } from "../runtime/bson-numbers.js";

function isObjectIdHex(value: string): boolean {
  return /^[0-9a-f]{24}$/i.test(value);
}

function invalidFilter(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** Coerce a string filter value to the non-numeric BSON type observed for its column. */
export function coerceFilterValue(value: string, dataType: string): unknown {
  switch (dataType) {
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    case "objectId":
      return ObjectId.isValid(value) ? new ObjectId(value) : value;
    case "date": {
      const instant = parseTimestampInstant(value);
      if (!instant) throw invalidFilter(`"${value}" is not a valid date/time filter value.`);
      return instant;
    }
    default:
      return value;
  }
}

/**
 * Exact operands for numeric filter text. Decimal text equals both its nearest Double and its
 * exact Decimal128, which MongoDB compares as different numbers.
 */
function numericOperands(value: string, column: string): unknown[] {
  const text = value.trim();
  if (!isExactNumericText(text)) {
    throw invalidFilter(`Filter value for number field "${column}" must be an exact number.`);
  }
  const integer = int64FromText(text);
  if (integer !== undefined) return [exactInteger(integer)];
  const operands: unknown[] = [];
  const double = Number(text);
  if (Number.isFinite(double)) operands.push(double);
  try {
    operands.push(Decimal128.fromString(text));
  } catch {
    // Text beyond Decimal128 precision still compares through its Double.
  }
  if (operands.length === 0) {
    throw invalidFilter(`Filter value for number field "${column}" is out of range.`);
  }
  return operands;
}

const COMPARISON_OPERATORS = {
  eq: "$eq",
  neq: "$ne",
  lt: "$lt",
  lte: "$lte",
  gt: "$gt",
  gte: "$gte"
} as const;

function buildNumericCondition(
  column: string,
  op: keyof typeof COMPARISON_OPERATORS,
  operands: unknown[]
): Record<string, unknown> {
  if (operands.length === 1) return { [column]: { [COMPARISON_OPERATORS[op]]: operands[0] } };
  if (op === "eq") return { [column]: { $in: operands } };
  if (op === "neq") return { [column]: { $nin: operands } };
  const each = operands.map((operand) => ({ [column]: { [COMPARISON_OPERATORS[op]]: operand } }));
  // Strict bounds must exclude every representation; inclusive bounds admit any of them.
  return op === "lt" || op === "gt" ? { $and: each } : { $or: each };
}

function buildMongoCondition(
  filter: RowFilter,
  dataTypeByColumn: Map<string, string>
): Record<string, unknown> {
  if (filter.op === "isNull") return { [filter.column]: { $eq: null } };
  if (filter.op === "isNotNull") return { [filter.column]: { $ne: null } };
  if (filter.op === "contains") {
    if (["object", "array"].includes(filter.columnDataType?.toLowerCase() ?? "")) {
      return { $expr: buildContainsExpression(`$${filter.column}`, filter.value ?? "") };
    }
    return { [filter.column]: { $regex: escapeRegExp(filter.value ?? ""), $options: "i" } };
  }
  const dataType = filter.columnDataType ?? dataTypeByColumn.get(filter.column) ?? "string";
  if (dataType === "number") {
    return buildNumericCondition(
      filter.column,
      filter.op,
      numericOperands(filter.value ?? "", filter.column)
    );
  }
  const text = filter.value ?? "";
  // Grid cells render ObjectIds as hex, so hex text in a mixed-type field must match either form.
  if (dataType === "mixed" && (filter.op === "eq" || filter.op === "neq") && isObjectIdHex(text)) {
    const operands = [new ObjectId(text), text];
    return { [filter.column]: filter.op === "eq" ? { $in: operands } : { $nin: operands } };
  }
  const value = coerceFilterValue(text, dataType);
  return { [filter.column]: { [COMPARISON_OPERATORS[filter.op]]: value } };
}

function regexMatch(input: unknown, value: string): Record<string, unknown> {
  return {
    $regexMatch: {
      input: { $convert: { input, to: "string", onError: "", onNull: "" } },
      regex: escapeRegExp(value),
      options: "i"
    }
  };
}

/** Native aggregation expression that searches nested object keys/values and array elements. */
function buildContainsExpression(
  input: unknown,
  value: string,
  depth = 0
): Record<string, unknown> {
  return {
    $anyElementTrue: {
      $map: {
        input: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $type: input }, "object"] },
                then: { $objectToArray: input }
              },
              {
                case: { $eq: [{ $type: input }, "array"] },
                then: { $map: { input, as: "item", in: { k: "", v: "$$item" } } }
              }
            ],
            default: [{ k: "", v: input }]
          }
        },
        as: "entry",
        in: {
          $or: [
            regexMatch("$$entry.k", value),
            depth >= 8
              ? regexMatch("$$entry.v", value)
              : buildContainsExpression("$$entry.v", value, depth + 1)
          ]
        }
      }
    }
  };
}

/** Build a MongoDB find document from validated row filters. */
export function buildMongoFilter(
  filters: RowFilter[] | undefined,
  columns: readonly ColumnMetadata[],
  search?: ResolvedRowSearch
): Record<string, unknown> {
  const dataTypeByColumn = new Map(columns.map((column) => [column.name, column.dataType]));
  const conditions = (filters ?? []).map((filter) => buildMongoCondition(filter, dataTypeByColumn));
  if (search) {
    const searchable = search.columns.filter(
      (column) => column.dataType.toLowerCase() !== "binary"
    );
    if (searchable.length > 0) {
      conditions.push({
        $expr: {
          $or: searchable.map((column) => buildContainsExpression(`$${column.name}`, search.value))
        }
      });
    }
  }
  return conditions.length > 0 ? { $and: conditions } : {};
}
