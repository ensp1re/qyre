import type { ColumnMetadata, RowFilter } from "@qyre/core";
import { escapeRegExp, type ResolvedRowSearch } from "@qyre/driver-contract";
import { ObjectId } from "mongodb";

/** Coerce a string filter value to the BSON type observed for its column. */
export function coerceFilterValue(value: string, dataType: string): unknown {
  switch (dataType) {
    case "number": {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    }
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    case "objectId":
      return ObjectId.isValid(value) ? new ObjectId(value) : value;
    case "date": {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed;
    }
    default:
      return value;
  }
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
  const value = coerceFilterValue(
    filter.value ?? "",
    dataTypeByColumn.get(filter.column) ?? "string"
  );
  const mongoOp = { eq: "$eq", neq: "$ne", lt: "$lt", lte: "$lte", gt: "$gt", gte: "$gte" }[
    filter.op
  ];
  return { [filter.column]: { [mongoOp]: value } };
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
