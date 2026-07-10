import type { FilterOp, RowFilter } from "@qyre/core";
import { escapeLikePattern } from "@qyre/driver-contract";

/** Quote a SQL identifier safely (SQLite uses the standard `"..."` convention). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const COMPARE_OPERATORS: Partial<Record<FilterOp, string>> = {
  eq: "=",
  neq: "!=",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">="
};

/** Build a parameterized filter for SQLite row queries. */
export function buildFilterClause(filters: RowFilter[] | undefined): {
  clause: string;
  params: unknown[];
} {
  if (!filters || filters.length === 0) return { clause: "", params: [] };
  const params: unknown[] = [];
  const conditions = filters.map((filter) => {
    const column = quoteIdent(filter.column);
    if (filter.op === "isNull") return `${column} IS NULL`;
    if (filter.op === "isNotNull") return `${column} IS NOT NULL`;
    if (filter.op === "contains") {
      params.push(`%${escapeLikePattern(filter.value ?? "")}%`);
      return `${column} LIKE ? ESCAPE '\\'`;
    }
    params.push(filter.value);
    return `${column} ${COMPARE_OPERATORS[filter.op]} ?`;
  });
  return { clause: ` WHERE ${conditions.join(" AND ")}`, params };
}
