/** Thrown when a query is not allowed under Humb's read-only MVP policy. */
export class ReadOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyViolationError";
  }
}

const ALLOWED_LEADING_KEYWORDS = ["select", "with", "explain", "show", "table", "values"];

/** Remove SQL comments so keyword detection is not fooled by leading comments. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim();
}

/**
 * Assert that a SQL string is a single read-only statement.
 * Throws {@link ReadOnlyViolationError} otherwise. This is a defense-in-depth check;
 * adapters should also run queries on a read-only connection where possible.
 */
export function assertReadOnly(sql: string): void {
  const cleaned = stripComments(sql);
  if (!cleaned) {
    throw new ReadOnlyViolationError("Empty query.");
  }

  const withoutTrailingSemicolon = cleaned.replace(/;\s*$/, "");
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
}
