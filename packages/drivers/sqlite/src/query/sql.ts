import { DATABASE_ENGINES } from "@qyre/core";
import type { FilterOp, RowFilter } from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { escapeLikePattern, type ResolvedRowSearch } from "@qyre/driver-contract";

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
export function buildFilterClause(
  filters: RowFilter[] | undefined,
  search?: ResolvedRowSearch
): {
  clause: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const conditions = (filters ?? []).map((filter) => {
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
  const searchable = search?.columns.filter(
    (column) => classifyFilterColumnKind(column.dataType, DATABASE_ENGINES.sqlite) !== "binary"
  );
  if (search && searchable && searchable.length > 0) {
    const pattern = `%${escapeLikePattern(search.value)}%`;
    conditions.push(
      `(${searchable
        .map((column) => {
          params.push(pattern);
          return `CAST(${quoteIdent(column.name)} AS TEXT) LIKE ? ESCAPE '\\'`;
        })
        .join(" OR ")})`
    );
  }
  if (conditions.length === 0) return { clause: "", params: [] };
  return { clause: ` WHERE ${conditions.join(" AND ")}`, params };
}
