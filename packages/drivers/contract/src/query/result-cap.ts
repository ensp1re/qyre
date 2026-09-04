import { stripComments } from "../safety/read-only.js";

export const MAX_QUERY_RESULT_ROWS = 1000;

const ROW_CARDINALITY_KEYWORDS = new Set(["select", "with", "values", "table"]);

/** Cap row-producing read queries with a database-side wrapper. */
export function capResultRows(sql: string, limit: number = MAX_QUERY_RESULT_ROWS): string {
  const withoutTrailingSemicolon = sql.trim().replace(/;\s*$/, "");
  // Detect the keyword after stripping comments; the original SQL remains executable.
  const firstKeyword =
    stripComments(withoutTrailingSemicolon).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!ROW_CARDINALITY_KEYWORDS.has(firstKeyword)) {
    return sql;
  }
  return `SELECT * FROM (${withoutTrailingSemicolon}) AS qyre_capped_query LIMIT ${limit}`;
}
