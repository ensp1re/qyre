import { DATABASE_ENGINES } from "@qyre/core";
import type { FilterOp, RowFilter } from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { escapeLikePattern, type ResolvedRowSearch } from "@qyre/driver-contract";

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

/** Built-in string types (information_schema data_type) that support ILIKE without a cast. User-
 * defined types report their own name, so enums and domains always go through `::text`. */
const NATIVE_TEXT_TYPES = new Set(["text", "character varying", "character", "name"]);

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
      const target = NATIVE_TEXT_TYPES.has(filter.columnDataType?.toLowerCase() ?? "")
        ? column
        : `${column}::text`;
      return `${target} ILIKE $${params.length} ESCAPE '\\'`;
    }
    params.push(filter.value);
    return `${column} ${COMPARE_OPERATORS[filter.op]} $${params.length}`;
  });
  const searchable = search?.columns.filter(
    (column) =>
      classifyFilterColumnKind(column.dataType, DATABASE_ENGINES.postgres, column) !== "binary"
  );
  if (search && searchable && searchable.length > 0) {
    params.push(`%${escapeLikePattern(search.value)}%`);
    const parameter = `$${params.length}`;
    conditions.push(
      `(${searchable
        .map((column) => `CAST(${quoteIdent(column.name)} AS text) ILIKE ${parameter} ESCAPE '\\'`)
        .join(" OR ")})`
    );
  }
  if (conditions.length === 0) return { clause: "", params: [] };
  return { clause: ` WHERE ${conditions.join(" AND ")}`, params };
}
