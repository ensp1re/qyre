import { scanSql } from "./sql-lexer.js";
import type { SqlDialect, SqlSegment } from "./sql-lexer.js";

export const MAX_QUERY_RESULT_ROWS = 1000;

const ROW_CARDINALITY_KEYWORDS = new Set(["select", "with", "values", "table"]);

function isTrimmableComment(segment: SqlSegment, text: string): boolean {
  if (segment.kind !== "comment" || segment.executable) return false;
  return !text.startsWith("/*") || (text.length >= 4 && text.endsWith("*/"));
}

/**
 * Cap row-producing read queries with a database-side wrapper. Lexing uses the dialect's default
 * mode: no quote can precede the leading keyword, so other MySQL modes agree on it, and where they
 * disagree on the trailing cut the wrapped SQL only loses trailing text or becomes invalid.
 */
export function capResultRows(
  sql: string,
  limit: number = MAX_QUERY_RESULT_ROWS,
  dialect: SqlDialect = "postgres"
): string {
  const segments = scanSql(sql, dialect);
  const firstKeyword =
    segments
      .filter((segment) => segment.kind !== "comment")
      .map((segment) => sql.slice(segment.start, segment.end))
      .join(" ")
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() ?? "";
  if (!ROW_CARDINALITY_KEYWORDS.has(firstKeyword)) {
    return sql;
  }
  // Cut trailing plain comments and semicolons so neither can swallow the wrapper's closing paren.
  let end = 0;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index] as SqlSegment;
    const text = sql.slice(segment.start, segment.end);
    if (segment.kind === "code") {
      const kept = text.replace(/[\s;]+$/, "");
      if (kept) {
        end = segment.start + kept.length;
        break;
      }
    } else if (!isTrimmableComment(segment, text)) {
      end = segment.end;
      break;
    }
  }
  const body = sql.slice(0, end).trim();
  return `SELECT * FROM (${body}) AS qyre_capped_query LIMIT ${limit}`;
}
