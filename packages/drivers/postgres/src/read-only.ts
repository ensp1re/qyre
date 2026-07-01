import { ReadOnlyViolationError } from "@humb/driver-contract";

export { ReadOnlyViolationError } from "@humb/driver-contract";

const ALLOWED_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

// Data-modifying/DDL/permission keywords that must never appear anywhere in the statement, not just
// as the leading keyword - Postgres allows *writable CTEs* (e.g.
// `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`), which start with the allowed "with"
// keyword but perform a real DELETE. This list is a heuristic, defense-in-depth layer, not the
// authoritative guarantee - the real backstop is running the query inside a Postgres
// `READ ONLY` transaction (see the adapter's `runReadOnlyQuery`), which Postgres itself enforces
// regardless of what this scan misses.
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
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ") // dollar-quoted strings
    .replace(/'(?:[^']|'')*'/g, " ") // single-quoted string literals
    .replace(/"(?:[^"]|"")*"/g, " "); // double-quoted identifiers
}

function findForbiddenKeyword(sql: string): string | undefined {
  const lower = sql.toLowerCase();
  return FORBIDDEN_KEYWORDS.find((keyword) => new RegExp(`\\b${keyword}\\b`).test(lower));
}

/**
 * Assert that a SQL string is a single read-only statement.
 * Throws {@link ReadOnlyViolationError} otherwise. This is a defense-in-depth check; the adapter
 * also runs the query inside a `READ ONLY` transaction as the authoritative guarantee.
 */
export function assertReadOnly(sql: string): void {
  const withoutComments = stripComments(sql).trim();
  if (!withoutComments) {
    throw new ReadOnlyViolationError("Empty query.");
  }

  const withoutTrailingSemicolon = withoutComments.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
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
