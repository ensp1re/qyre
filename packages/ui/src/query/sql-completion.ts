import type {
  CompletionContext,
  CompletionResult,
  CompletionSource
} from "@codemirror/autocomplete";
import type { DatabaseEngine } from "@qyre/core";

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

export interface CompletionTable {
  readonly name: string;
  readonly columns: readonly string[];
}

const CLAUSE_KEYWORDS =
  "where|on|join|inner|left|right|full|outer|cross|group|order|limit|having|union";

const TABLE_REFERENCE_RE = new RegExp(
  `\\b(?:from|join)\\s+((?:"[^"]+"|\`[^\`]+\`|\\w+)(?:\\.(?:"[^"]+"|\`[^\`]+\`|\\w+))?)` +
    `(?:\\s+(?:as\\s+)?((?:"[^"]+"|\`[^\`]+\`|(?!(?:${CLAUSE_KEYWORDS})\\b)\\w+)))?`,
  "gi"
);

function unquote(identifier: string): string {
  const match = /^(?:"([^"]+)"|`([^`]+)`)$/.exec(identifier);
  return match ? (match[1] ?? match[2] ?? identifier) : identifier;
}

function tableNameFromReference(reference: string): string {
  const lastDot = reference.lastIndexOf(".");
  const namePart = lastDot === -1 ? reference : reference.slice(lastDot + 1);
  return unquote(namePart);
}

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

const QUALIFIED_PREFIX_RE = /(?:"([^"]+)"|`([^`]+)`|(\w+))\.$/;

export function matchQualifiedPrefix(textBeforeCursor: string): string | null {
  const match = QUALIFIED_PREFIX_RE.exec(textBeforeCursor);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

export function needsQuoting(identifier: string): boolean {
  return !/^[a-z_][a-z0-9_]*$/.test(identifier);
}

export function quoteIdentifier(identifier: string, engine: DatabaseEngine): string {
  if (!needsQuoting(identifier)) return identifier;
  if (engine === "mysql") return `\`${identifier.replace(/`/g, "``")}\``;
  return `"${identifier.replace(/"/g, '""')}"`;
}

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
