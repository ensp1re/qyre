import { maskSql } from "./sql-lexer.js";
import type { SqlDialect } from "./sql-lexer.js";

export const MAX_QUERY_RESULT_ROWS = 1000;

const ROW_CARDINALITY_KEYWORDS = new Set(["select", "with", "values", "table"]);

/** Cap row-producing read queries with a database-side wrapper. */
export function capResultRows(
  sql: string,
  limit: number = MAX_QUERY_RESULT_ROWS,
  dialect: SqlDialect = "postgres"
): string {
  const withoutComments = maskSql(sql, dialect, ["comment"]);
  const firstKeyword = withoutComments.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!ROW_CARDINALITY_KEYWORDS.has(firstKeyword)) {
    return sql;
  }
  // Cut trailing comments and semicolons so neither can swallow the wrapper's closing paren.
  let end = withoutComments.length;
  while (end > 0 && /[\s;]/.test(withoutComments[end - 1] as string)) end -= 1;
  const body = sql.slice(0, end).trim();
  return `SELECT * FROM (${body}) AS qyre_capped_query LIMIT ${limit}`;
}
