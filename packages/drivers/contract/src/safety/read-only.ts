import type { StatementClassification } from "@qyre/core";
import { maskSql, SQL_DIALECTS, sqlLexModes } from "../query/sql-lexer.js";
import type { SqlDialect, SqlLexMode } from "../query/sql-lexer.js";
import { ReadOnlyViolationError } from "./errors.js";

export { ReadOnlyViolationError } from "./errors.js";
export type { StatementClassification } from "@qyre/core";

const READ_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

const DESTRUCTIVE_KEYWORDS = ["drop", "truncate"];
const DESTRUCTIVE_WITHOUT_WHERE_KEYWORDS = new Set(["update", "delete"]);
// UPDATE/DELETE after these words is a clause (FOR UPDATE, ON DELETE, DO UPDATE, KEY UPDATE).
const NON_STATEMENT_PREFIXES = new Set(["for", "key", "on", "do"]);
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

const SEVERITY: Record<StatementClassification, number> = {
  read: 0,
  mutation: 1,
  ddl: 2,
  destructive: 3
};

/** Remove SQL comments (but not comment markers inside literals) before keyword detection. */
export function stripComments(sql: string, dialect: SqlDialect = "postgres"): string {
  return maskSql(sql, dialect, ["comment"]);
}

function hasWord(sql: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(sql);
}

interface ScopedToken {
  readonly text: string;
  readonly depth: number;
}

/** Words and parentheses; a `)` carries the depth it returns to. */
function scopedTokens(code: string): ScopedToken[] {
  const tokens: ScopedToken[] = [];
  let depth = 0;
  for (const match of code.matchAll(/[()]|[a-z_][a-z0-9_$]*/g)) {
    const text = match[0];
    if (text === "(") {
      tokens.push({ text, depth });
      depth += 1;
    } else if (text === ")") {
      depth -= 1;
      tokens.push({ text, depth });
    } else {
      tokens.push({ text, depth });
    }
  }
  return tokens;
}

/** True when an UPDATE/DELETE statement has no WHERE at its own nesting level. */
function hasUnfilteredUpdateOrDelete(code: string): boolean {
  const tokens = scopedTokens(code);
  return tokens.some((token, index) => {
    if (!DESTRUCTIVE_WITHOUT_WHERE_KEYWORDS.has(token.text)) return false;
    const previous = tokens[index - 1];
    if (previous && NON_STATEMENT_PREFIXES.has(previous.text)) return false;
    for (const later of tokens.slice(index + 1)) {
      if (later.text === ")" && later.depth < token.depth) break;
      if (later.depth === token.depth && later.text === "where") return false;
    }
    return true;
  });
}

function mostRestrictive(
  classifications: readonly StatementClassification[]
): StatementClassification {
  return classifications.reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst));
}

function classifyForDialect(sql: string, dialect: SqlDialect): StatementClassification {
  if (!maskSql(sql, dialect, ["comment"]).trim()) {
    throw new ReadOnlyViolationError("Empty query.");
  }
  // Statement boundaries come from the default mode. A `;` seen only under another mode needs no
  // rejection: drivers run one statement per call, so the server refuses a second one itself.
  return mostRestrictive(
    sqlLexModes(dialect).map((mode, index) => classifyCode(sql, dialect, mode, index === 0))
  );
}

function classifyCode(
  sql: string,
  dialect: SqlDialect,
  mode: SqlLexMode,
  checkStatementCount: boolean
): StatementClassification {
  const code = maskSql(sql, dialect, ["comment", "string", "identifier"], mode)
    .trim()
    .replace(/;\s*$/, "");
  if (checkStatementCount && code.includes(";")) {
    throw new ReadOnlyViolationError("Multiple statements are not allowed.");
  }

  const lower = code.toLowerCase();

  if (DESTRUCTIVE_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "destructive";
  }
  if (hasUnfilteredUpdateOrDelete(lower)) {
    return "destructive";
  }
  if (DDL_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "ddl";
  }
  if (MUTATION_KEYWORDS.some((keyword) => hasWord(lower, keyword))) {
    return "mutation";
  }

  const firstKeyword = lower.split(/\s+/)[0] ?? "";
  if (READ_LEADING_KEYWORDS.includes(firstKeyword)) {
    return "read";
  }
  // Unknown syntax is treated as a mutation.
  return "mutation";
}

/**
 * Classify one SQL statement for read-only policy checks. Without a dialect, the statement is
 * lexed under every supported dialect and the most restrictive result wins.
 */
export function classifyStatement(sql: string, dialect?: SqlDialect): StatementClassification {
  const dialects = dialect ? [dialect] : SQL_DIALECTS;
  return mostRestrictive(dialects.map((each) => classifyForDialect(sql, each)));
}

/** Reject SQL that is not classified as a read. */
export function assertReadOnly(sql: string, dialect?: SqlDialect): void {
  const classification = classifyStatement(sql, dialect);
  if (classification !== "read") {
    throw new ReadOnlyViolationError(
      `Only read-only statements are allowed (${READ_LEADING_KEYWORDS.join(", ").toUpperCase()}). ` +
        `Statement classified as "${classification}".`
    );
  }
}

/** Validate an EXPLAIN target, requiring reads for EXPLAIN ANALYZE. */
export function classifyExplainTarget(
  sql: string,
  analyze: boolean,
  dialect?: SqlDialect
): StatementClassification {
  const classification = classifyStatement(sql, dialect);
  if (analyze && classification !== "read") {
    throw new ReadOnlyViolationError(
      "EXPLAIN ANALYZE is limited to read-classified SQL because it executes the statement."
    );
  }
  return classification;
}
