/** PostgreSQL's text-plan statement. ANALYZE is opt-in because it executes the target query. */
export function buildPostgresExplainSql(sql: string, analyze: boolean): string {
  const target = sql.trim().replace(/;\s*$/, "");
  return `EXPLAIN (${analyze ? "ANALYZE, " : ""}FORMAT TEXT) ${target}`;
}

/** Normalize pg's one-column, one-line-per-row text plan. */
export function postgresPlanLines(rows: Array<Record<string, unknown>>): string[] {
  return rows.flatMap((row) => String(row["QUERY PLAN"] ?? "").split("\n")).filter(Boolean);
}
