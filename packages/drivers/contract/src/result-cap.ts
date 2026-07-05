/**
 * `runReadOnlyQuery` had no `LIMIT` (F050): `SELECT * FROM huge_table` fetched/serialized/rendered
 * every row, with no cap on server memory or the browser tab. 1,000 is generous for ad hoc
 * inspection in the SQL Editor while still bounding a runaway scan - distinct from the Tables tab's
 * much smaller `MAX_PAGE_SIZE` (200), which is a *default* page size for browsing, not a one-off
 * exploratory query.
 */
export const MAX_QUERY_RESULT_ROWS = 1000;

const ROW_CARDINALITY_KEYWORDS = new Set(["select", "with", "values", "table"]);

/**
 * Wraps `sql` in an outer `SELECT ... LIMIT` so the database itself stops producing rows past the
 * cap, instead of the adapter fetching an unbounded result set into memory and only truncating
 * client-side. Only applied to statements that can actually return an unbounded number of rows
 * (`SELECT`/`WITH`/`VALUES`/`TABLE`, already validated read-only by `assertReadOnly`) - `EXPLAIN`
 * (a query plan) and `SHOW` (a small, bounded config listing) aren't wrapped since they aren't the
 * unbounded-rows risk this guards against, and `EXPLAIN`/`SHOW` aren't valid subquery sources.
 */
export function capResultRows(sql: string, limit: number = MAX_QUERY_RESULT_ROWS): string {
  const withoutTrailingSemicolon = sql.trim().replace(/;\s*$/, "");
  const firstKeyword = withoutTrailingSemicolon.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!ROW_CARDINALITY_KEYWORDS.has(firstKeyword)) {
    return sql;
  }
  return `SELECT * FROM (${withoutTrailingSemicolon}) AS qyre_capped_query LIMIT ${limit}`;
}
