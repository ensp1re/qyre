/**
 * Escapes `%`, `_`, and the escape character itself so a `contains` filter's literal value (F072)
 * can't be misread as a SQL `LIKE`/`ILIKE` wildcard. Pair with an explicit `ESCAPE '\'` clause -
 * SQLite has no default escape character, and relying on Postgres/MySQL's default (also `\`)
 * rather than stating it explicitly would make the three engines' queries silently diverge.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Escapes regex metacharacters so a `contains` filter's literal value (F072) can't be misread as
 * part of a MongoDB `$regex` pattern. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
