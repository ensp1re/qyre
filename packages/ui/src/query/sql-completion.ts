import type {
  CompletionContext,
  CompletionResult,
  CompletionSource
} from "@codemirror/autocomplete";
import type { DatabaseEngine } from "@qyre/core";

/**
 * Only the SELECT-shaped keywords Qyre's read-only query runner can ever accept (F006) - a full
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

export function matchColumns(prefix: string, columnNames: readonly string[]): string[] {
  if (!prefix) return [...columnNames];
  const lower = prefix.toLowerCase();
  return columnNames.filter((name) => name.toLowerCase().startsWith(lower));
}

/** A table available for completion (F127) - just the shape the completion source needs, not the
 * full `TableMetadata` (columns already reduced to bare names by the caller). */
export interface CompletionTable {
  readonly name: string;
  readonly columns: readonly string[];
}

/** Clause keywords that can immediately follow a table reference with no alias between them
 * (`FROM users WHERE ...`, `FROM a JOIN b ...`) - excluded from the alias capture below so they're
 * never mistaken for one. Not exhaustive SQL, just enough to cover a query's real shape. */
const CLAUSE_KEYWORDS =
  "where|on|join|inner|left|right|full|outer|cross|group|order|limit|having|union";

/** Matches one `FROM`/`JOIN` clause's table reference and optional alias: `schema.table alias`,
 * `` `table` `t` ``, `"table" AS t`, or a bare `table` with no alias. Global so
 * {@link resolveReferencedTables} can find every reference in one statement. */
const TABLE_REFERENCE_RE = new RegExp(
  `\\b(?:from|join)\\s+((?:"[^"]+"|\`[^\`]+\`|\\w+)(?:\\.(?:"[^"]+"|\`[^\`]+\`|\\w+))?)` +
    `(?:\\s+(?:as\\s+)?((?:"[^"]+"|\`[^\`]+\`|(?!(?:${CLAUSE_KEYWORDS})\\b)\\w+)))?`,
  "gi"
);

/** Strips a single layer of `"..."`/`` `...` `` quoting, if present. */
function unquote(identifier: string): string {
  const match = /^(?:"([^"]+)"|`([^`]+)`)$/.exec(identifier);
  return match ? (match[1] ?? match[2] ?? identifier) : identifier;
}

/** The bare table name from a possibly schema-qualified, possibly quoted reference
 * (`schema.table` -> `table`). */
function tableNameFromReference(reference: string): string {
  const lastDot = reference.lastIndexOf(".");
  const namePart = lastDot === -1 ? reference : reference.slice(lastDot + 1);
  return unquote(namePart);
}

/**
 * Scans every `FROM`/`JOIN` clause in `sql` and maps each alias (and each unaliased table's own
 * name) to the matching {@link CompletionTable}, case-insensitively - `FROM users u JOIN orders o`
 * yields `{ u: users, users: users, o: orders, orders: orders }`. Table references that don't match
 * a known table (a typo, a CTE name, ...) are silently skipped rather than surfaced as an error -
 * this only powers optional completions, never validation.
 */
export function resolveReferencedTables(
  sql: string,
  tables: readonly CompletionTable[]
): Map<string, CompletionTable> {
  const byLowerName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  const resolved = new Map<string, CompletionTable>();

  for (const match of sql.matchAll(TABLE_REFERENCE_RE)) {
    const [, reference, alias] = match;
    if (!reference) continue;
    const bareName = tableNameFromReference(reference);
    const table = byLowerName.get(bareName.toLowerCase());
    if (!table) continue;
    resolved.set(bareName.toLowerCase(), table);
    if (alias) resolved.set(unquote(alias).toLowerCase(), table);
  }

  return resolved;
}

/** Matches `<identifier>.` (optionally quoted) immediately before the cursor, with nothing after
 * the dot yet typed - the position column-completion should trigger from. */
const QUALIFIED_PREFIX_RE = /(?:"([^"]+)"|`([^`]+)`|(\w+))\.$/;

/** True + the alias/table text when the cursor sits right after `alias.`/`table.` (F127). */
export function matchQualifiedPrefix(textBeforeCursor: string): string | null {
  const match = QUALIFIED_PREFIX_RE.exec(textBeforeCursor);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/** An identifier is safe to leave unquoted only if every engine here folds/reads it identically:
 * lowercase, alphanumeric-or-underscore, not starting with a digit. Anything else (mixed case,
 * spaces, punctuation, a leading digit) must be quoted - Postgres in particular folds an unquoted
 * identifier to lowercase, so leaving a mixed-case column unquoted would reference the wrong name
 * entirely. */
export function needsQuoting(identifier: string): boolean {
  return !/^[a-z_][a-z0-9_]*$/.test(identifier);
}

/** Quotes `identifier` in the connected engine's dialect only if {@link needsQuoting} says it must
 * be - MySQL uses backticks, Postgres/SQLite use double quotes, both doubling an embedded quote of
 * their own kind. MongoDB never reaches here (it has no SQL query runner, F063). */
export function quoteIdentifier(identifier: string, engine: DatabaseEngine): string {
  if (!needsQuoting(identifier)) return identifier;
  if (engine === "mysql") return `\`${identifier.replace(/`/g, "``")}\``;
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Schema-aware completion source (F013, extended by F127 for columns): table names after
 * FROM/JOIN; that table's columns right after `alias.`/`table.`; otherwise read-only SQL keywords
 * plus the columns of every table referenced so far in the statement (general expression
 * positions - SELECT lists, WHERE/ON clauses, ...). `getTables` is a getter (not a static array) so
 * the source always sees the caller's latest schema data without the CodeMirror extension needing
 * to be reconfigured. Every suggested identifier is quoted in the connected `engine`'s dialect if
 * it needs it (F127) - the label stays the bare name, only the inserted text is quoted.
 */
export function createSqlCompletionSource(
  getTables: () => readonly CompletionTable[],
  getEngine: () => DatabaseEngine
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const windowStart = Math.max(0, word.from - 64);
    const textBefore = context.state.sliceDoc(windowStart, word.from);
    const tables = getTables();
    const engine = getEngine();

    if (isTableNamePosition(textBefore)) {
      const options = matchTableNames(
        word.text,
        tables.map((table) => table.name)
      ).map((name) => ({
        label: name,
        type: "class",
        apply: quoteIdentifier(name, engine)
      }));
      if (options.length === 0) return null;
      return { from: word.from, options, validFor: /^\w*$/ };
    }

    const qualifiedPrefix = matchQualifiedPrefix(textBefore);
    if (qualifiedPrefix !== null) {
      const fullSql = context.state.doc.toString();
      const table = resolveReferencedTables(fullSql, tables).get(qualifiedPrefix.toLowerCase());
      if (!table) return null;
      const options = matchColumns(word.text, table.columns).map((name) => ({
        label: name,
        type: "property",
        apply: quoteIdentifier(name, engine)
      }));
      if (options.length === 0) return null;
      return { from: word.from, options, validFor: /^\w*$/ };
    }

    const fullSql = context.state.doc.toString();
    const referencedTables = [...new Set(resolveReferencedTables(fullSql, tables).values())];
    const columnOptions = referencedTables.flatMap((table) =>
      matchColumns(word.text, table.columns).map((name) => ({
        label: name,
        type: "property",
        apply: quoteIdentifier(name, engine)
      }))
    );
    const keywordOptions = matchKeywords(word.text).map((keyword) => ({
      label: keyword,
      type: "keyword"
    }));
    const options = [...keywordOptions, ...columnOptions];

    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}
