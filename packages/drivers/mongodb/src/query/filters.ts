import type { ColumnMetadata, RowFilter } from "@qyre/core";
import { escapeRegExp } from "@qyre/driver-contract";
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
      const candidate = JSON.parse(filter.value ?? "null") as unknown;
      if (Array.isArray(candidate)) return { [filter.column]: { $all: candidate } };
      if (candidate && typeof candidate === "object") {
        const entries = Object.entries(candidate);
        if (entries.length === 0) return { [filter.column]: { $type: "object" } };
        return {
          $and: entries.map(([key, value]) => ({
            [`${filter.column}.${key}`]: value
          }))
        };
      }
      return { [filter.column]: candidate };
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

/** Build a MongoDB find document from validated row filters. */
export function buildMongoFilter(
  filters: RowFilter[] | undefined,
  columns: readonly ColumnMetadata[]
): Record<string, unknown> {
  if (!filters || filters.length === 0) return {};
  const dataTypeByColumn = new Map(columns.map((column) => [column.name, column.dataType]));
  return { $and: filters.map((filter) => buildMongoCondition(filter, dataTypeByColumn)) };
}
