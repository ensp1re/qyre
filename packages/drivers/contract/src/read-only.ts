import { ReadOnlyViolationError } from "./errors.js";

export { ReadOnlyViolationError } from "./errors.js";

/** A single SQL statement's write classification, from a pure text heuristic (see below). */
export type StatementClassification = "read" | "mutation" | "ddl" | "destructive";

const READ_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

// Every keyword below is a partition of the same forbidden-word set assertReadOnly has always
// scanned for - not just as the leading keyword, since Postgres allows *writable CTEs*
// (`WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`), which start with the allowed "with"
// keyword but perform a real DELETE. This is a heuristic, defense-in-depth layer, not the
// authoritative guarantee - every engine adapter's `runReadOnlyQuery` must also enforce read-only
// at the engine level (a Postgres `READ ONLY` transaction, a SQLite read-only connection, etc.),
// which catches whatever this scan misses.
const DESTRUCTIVE_KEYWORDS = ["drop", "truncate"];
// UPDATE/DELETE are only unconditionally destructive when no WHERE clause bounds them (an
// unqualified UPDATE/DELETE rewrites or empties the whole table); with a WHERE clause they're an
// ordinary mutation, checked below.
const DESTRUCTIVE_WITHOUT_WHERE_KEYWORDS = ["update", "delete"];
const DDL_KEYWORDS = ["create", "alter", "grant", "revoke", "comment", "security"];
const MUTATION_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "copy",
  "call",
  "do",
  "vacuum",
  "reindex",
  "refresh",
  "lock"
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

function hasWord(sql: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(sql);
}

/**
 * Classify a single SQL statement as `read` | `mutation` | `ddl` | `destructive`, from the same
 * comment/literal-stripping text scan `assertReadOnly` has always used (now built on top of this).
 * Pure text heuristic, defense-in-depth only - see the module-level comment on
 * {@link DESTRUCTIVE_KEYWORDS}.
 *
 * Throws {@link ReadOnlyViolationError} for an empty query or multiple statements, since both make
 * classification meaningless (there's no single statement to label).
 */
export function classifyStatement(sql: string): StatementClassification {
  const withoutComments = stripComments(sql).trim();
  if (!withoutComments) {
    throw new ReadOnlyViolationError("Empty query.");
  }

  const withoutTrailingSemicolon = withoutComments.replace(/;\s*$/, "");
  // Check for a `;` against literal/identifier-stripped text, not raw SQL - otherwise a data value
  // that happens to contain a semicolon (a URL, a free-text field, an encoded blob) is wrongly
  // rejected as "multiple statements".
  const stripped = stripLiterals(withoutTrailingSemicolon);
  if (stripped.includes(";")) {
    throw new ReadOnlyViolationError("Multiple statements are not allowed.");
  }

  const lower = stripped.toLowerCase();

  if (DESTRUCTIVE_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "destructive";
  }
  if (
    DESTRUCTIVE_WITHOUT_WHERE_KEYWORDS.some((keyword) => hasWord(lower, keyword)) &&
    !hasWord(lower, "where")
  ) {
    return "destructive";
  }
  if (DDL_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "ddl";
  }
  if (MUTATION_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "mutation";
  }

  const firstKeyword = withoutTrailingSemicolon.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (READ_LEADING_KEYWORDS.includes(firstKeyword)) {
    return "read";
  }
  // Unrecognized statement (e.g. PRAGMA, vendor-specific syntax) - conservatively assume it could
  // write, since defense-in-depth means never treating the unknown as safe.
  return "mutation";
}

/**
 * Assert that a SQL string is a single read-only statement. Engine-agnostic: pure text scanning,
 * shared by every engine adapter so the heuristic behaves identically regardless of which database
 * is behind it.
 *
 * Throws {@link ReadOnlyViolationError} otherwise. This is a defense-in-depth check; each adapter's
 * `runReadOnlyQuery` must also enforce read-only at the engine level as the authoritative guarantee
 * (see {@link classifyStatement}'s top-level comment).
 */
export function assertReadOnly(sql: string): void {
  const classification = classifyStatement(sql);
  if (classification !== "read") {
    throw new ReadOnlyViolationError(
      `Only read-only statements are allowed (${READ_LEADING_KEYWORDS.join(", ").toUpperCase()}). ` +
        `Statement classified as "${classification}".`
    );
  }
}
