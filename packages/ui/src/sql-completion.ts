import type {
  CompletionContext,
  CompletionResult,
  CompletionSource
} from "@codemirror/autocomplete";

/**
 * Only the SELECT-shaped keywords Humb's read-only query runner can ever accept (F006) - a full
 * SQL grammar would offer INSERT/UPDATE/DELETE the server rejects anyway (see F013 spec).
 */
export const READ_ONLY_SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "ORDER BY",
  "GROUP BY",
  "LIMIT",
  "HAVING",
  "AS",
  "DISTINCT",
  "AND",
  "OR",
  "IN",
  "LIKE",
  "NULL",
  "IS"
] as const;

const TABLE_CONTEXT_RE = /\b(?:from|join)\s+\w*$/i;

/** True when the cursor sits right after `FROM `/`JOIN ` (optionally with a partial table name typed). */
export function isTableNamePosition(textBeforeCursor: string): boolean {
  return TABLE_CONTEXT_RE.test(textBeforeCursor);
}

export function matchKeywords(prefix: string): string[] {
  if (!prefix) return [...READ_ONLY_SQL_KEYWORDS];
  const upper = prefix.toUpperCase();
  return READ_ONLY_SQL_KEYWORDS.filter((keyword) => keyword.startsWith(upper));
}

export function matchTableNames(prefix: string, tableNames: readonly string[]): string[] {
  if (!prefix) return [...tableNames];
  const lower = prefix.toLowerCase();
  return tableNames.filter((name) => name.toLowerCase().startsWith(lower));
}

/**
 * Schema-aware completion source (F013): table names after FROM/JOIN, read-only SQL keywords
 * everywhere else. `getTableNames` is a getter (not a static array) so the source always sees the
 * caller's latest schema data without the CodeMirror extension needing to be reconfigured.
 */
export function createSqlCompletionSource(
  getTableNames: () => readonly string[]
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const windowStart = Math.max(0, word.from - 24);
    const textBefore = context.state.sliceDoc(windowStart, word.from);

    const options = isTableNamePosition(textBefore)
      ? matchTableNames(word.text, getTableNames()).map((name) => ({
          label: name,
          type: "class"
        }))
      : matchKeywords(word.text).map((keyword) => ({ label: keyword, type: "keyword" }));

    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}
