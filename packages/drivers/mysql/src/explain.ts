/** MySQL's native tree-plan statement. */
export function buildMysqlExplainSql(sql: string): string {
  const target = sql.trim().replace(/;\s*$/, "");
  return `EXPLAIN FORMAT=TREE ${target}`;
}

/** Normalize mysql2's single multiline EXPLAIN cell. */
export function mysqlPlanLines(rows: Array<Record<string, unknown>>): string[] {
  return rows.flatMap((row) => String(Object.values(row)[0] ?? "").split("\n")).filter(Boolean);
}
