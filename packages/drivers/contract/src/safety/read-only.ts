import type { StatementClassification } from "@qyre/core";
import { ReadOnlyViolationError } from "./errors.js";

export { ReadOnlyViolationError } from "./errors.js";
export type { StatementClassification } from "@qyre/core";

const READ_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

const DESTRUCTIVE_KEYWORDS = ["drop", "truncate"];
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
  "lock",
  // MySQL's read-only transaction does not block SELECT ... INTO OUTFILE/DUMPFILE.
  "outfile",
  "dumpfile"
];

/** Remove SQL comments before keyword detection. */
export function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripLiterals(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ") // dollar-quoted strings (Postgres)
    .replace(/'(?:[^']|'')*'/g, " ") // single-quoted string literals
    .replace(/"(?:[^"]|"")*"/g, " "); // double-quoted identifiers
}

function hasWord(sql: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(sql);
}

/** Classify one SQL statement for read-only policy checks. */
export function classifyStatement(sql: string): StatementClassification {
  const withoutComments = stripComments(sql).trim();
  if (!withoutComments) {
    throw new ReadOnlyViolationError("Empty query.");
  }

  const withoutTrailingSemicolon = withoutComments.replace(/;\s*$/, "");
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
  // Unknown syntax is treated as a mutation.
  return "mutation";
}

/** Reject SQL that is not classified as a read. */
export function assertReadOnly(sql: string): void {
  const classification = classifyStatement(sql);
  if (classification !== "read") {
    throw new ReadOnlyViolationError(
      `Only read-only statements are allowed (${READ_LEADING_KEYWORDS.join(", ").toUpperCase()}). ` +
        `Statement classified as "${classification}".`
    );
  }
}

/** Validate an EXPLAIN target, requiring reads for EXPLAIN ANALYZE. */
export function classifyExplainTarget(sql: string, analyze: boolean): StatementClassification {
  const classification = classifyStatement(sql);
  if (analyze && classification !== "read") {
    throw new ReadOnlyViolationError(
      "EXPLAIN ANALYZE is limited to read-classified SQL because it executes the statement."
    );
  }
  return classification;
}
