/** SQLite's compact query-planner statement. */
export function buildSqliteExplainSql(sql: string): string {
  const target = sql.trim().replace(/;\s*$/, "");
  return `EXPLAIN QUERY PLAN ${target}`;
}

/** Normalize SQLite's id/parent/detail rows into an indented text tree. */
export function sqlitePlanLines(rows: Array<Record<string, unknown>>): string[] {
  const depthById = new Map<number, number>();
  return rows.map((row) => {
    const id = Number(row.id);
    const parent = Number(row.parent);
    const depth = parent > 0 ? (depthById.get(parent) ?? 0) + 1 : 0;
    depthById.set(id, depth);
    return `${"  ".repeat(depth)}${String(row.detail ?? "")}`;
  });
}
