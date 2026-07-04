import { ReadOnlyViolationError } from "./errors.js";

export { ReadOnlyViolationError } from "./errors.js";

const ALLOWED_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

// Data-modifying/DDL/permission keywords that must never appear anywhere in the statement, not just
// as the leading keyword - e.g. Postgres allows *writable CTEs*
// (`WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`), which start with the allowed "with"
// keyword but perform a real DELETE. This list is a heuristic, defense-in-depth layer, not the
// authoritative guarantee - every engine adapter's `runReadOnlyQuery` must also enforce read-only at
// the engine level (a Postgres `READ ONLY` transaction, a SQLite read-only connection, etc.), which
// catches whatever this scan misses.
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "call",
  "do",
  "vacuum",
  "reindex",
  "refresh",
  "lock",
  "comment",
  "security"
];

/** Remove SQL comments so keyword detection is not fooled by them. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Remove string/identifier literals so keyword detection isn't fooled by data that happens to
 * contain a forbidden word (e.g. a string literal or a quoted column named "update").
 */
function stripLiterals(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ") // dollar-quoted strings (Postgres)
    .replace(/'(?:[^']|'')*'/g, " ") // single-quoted string literals
    .replace(/"(?:[^"]|"")*"/g, " "); // double-quoted identifiers
}

function findForbiddenKeyword(sql: string): string | undefined {
  const lower = sql.toLowerCase();
  return FORBIDDEN_KEYWORDS.find((keyword) => new RegExp(`\\b${keyword}\\b`).test(lower));
}

/**
 * Assert that a SQL string is a single read-only statement. Engine-agnostic: pure text scanning,
 * shared by every engine adapter so the heuristic behaves identically regardless of which database
 * is behind it.
 *
 * Throws {@link ReadOnlyViolationError} otherwise. This is a defense-in-depth check; each adapter's
 * `runReadOnlyQuery` must also enforce read-only at the engine level as the authoritative guarantee
 * (see this module's top-level comment).
 */
export function assertReadOnly(sql: string): void {
  const withoutComments = stripComments(sql).trim();
  if (!withoutComments) {
    throw new ReadOnlyViolationError("Empty query.");
  }

  const withoutTrailingSemicolon = withoutComments.replace(/;\s*$/, "");
  // Check for a `;` against literal/identifier-stripped text (same as the forbidden-keyword scan
  // below), not raw SQL - otherwise a data value that happens to contain a semicolon (a URL, a
  // free-text field, an encoded blob) is wrongly rejected as "multiple statements".
  if (stripLiterals(withoutTrailingSemicolon).includes(";")) {
    throw new ReadOnlyViolationError(
      "Multiple statements are not allowed in the read-only query runner."
    );
  }

  const firstKeyword = withoutTrailingSemicolon.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!ALLOWED_LEADING_KEYWORDS.includes(firstKeyword)) {
    throw new ReadOnlyViolationError(
      `Only read-only statements are allowed (${ALLOWED_LEADING_KEYWORDS.join(", ").toUpperCase()}). ` +
        `Received a statement starting with "${firstKeyword.toUpperCase()}".`
    );
  }

  const forbidden = findForbiddenKeyword(stripLiterals(withoutTrailingSemicolon));
  if (forbidden) {
    throw new ReadOnlyViolationError(
      `Only read-only statements are allowed. The query contains a disallowed keyword: ` +
        `"${forbidden.toUpperCase()}" (e.g. inside a writable CTE, which Postgres allows even though ` +
        `the statement starts with a read-only keyword).`
    );
  }
}
