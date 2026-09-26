import type { ColumnDefinition } from "@qyre/core";
import { quoteIdent } from "../query/sql.js";

export type ColumnChanges = Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>;

interface Token {
  kind: "word" | "quoted" | "string" | "number" | "punct";
  text: string;
  start: number;
  end: number;
}

interface ColumnSegment {
  kind: "nullability" | "default" | "generated" | "other";
  start: number;
  end: number;
}

/** A stored table definition the rebuild cannot reproduce; surfaced to the user as a 400. */
export function unsupportedRebuild(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;
const NUMBER = /^(?:0x[0-9a-f]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i;
const CLOSERS: Record<string, string> = { "'": "'", '"': '"', "`": "`", "[": "]" };

function readQuoted(sql: string, start: number): number {
  const open = sql[start] as string;
  const close = CLOSERS[open] as string;
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === close) {
      if (close !== "]" && sql[index + 1] === close) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  throw unsupportedRebuild("The table definition could not be parsed (unterminated quote).");
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index] as string;
    if (/\s/.test(char)) {
      index += 1;
    } else if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index);
      index = newline === -1 ? sql.length : newline + 1;
    } else if (sql.startsWith("/*", index)) {
      const close = sql.indexOf("*/", index + 2);
      index = close === -1 ? sql.length : close + 2;
    } else if (char === "'") {
      const end = readQuoted(sql, index);
      tokens.push({ kind: "string", text: sql.slice(index, end), start: index, end });
      index = end;
    } else if (char === '"' || char === "`" || char === "[") {
      const end = readQuoted(sql, index);
      tokens.push({ kind: "quoted", text: sql.slice(index, end), start: index, end });
      index = end;
    } else if (/[xX]/.test(char) && sql[index + 1] === "'") {
      const end = readQuoted(sql, index + 1);
      tokens.push({ kind: "string", text: sql.slice(index, end), start: index, end });
      index = end;
    } else if (WORD_START.test(char)) {
      let end = index + 1;
      while (end < sql.length && WORD_PART.test(sql[end] as string)) end += 1;
      tokens.push({ kind: "word", text: sql.slice(index, end), start: index, end });
      index = end;
    } else {
      const number = NUMBER.exec(sql.slice(index));
      const end = number ? index + number[0].length : index + 1;
      tokens.push({
        kind: number ? "number" : "punct",
        text: sql.slice(index, end),
        start: index,
        end
      });
      index = end;
    }
  }
  return tokens;
}

function isWord(token: Token | undefined, ...words: string[]): boolean {
  return token?.kind === "word" && words.includes(token.text.toUpperCase());
}

function isName(token: Token | undefined): boolean {
  return token?.kind === "word" || token?.kind === "quoted" || token?.kind === "string";
}

function unquote(token: Token): string {
  if (token.kind === "word") return token.text;
  const close = CLOSERS[token.text[0] as string] as string;
  const inner = token.text.slice(1, -1);
  return close === "]" ? inner : inner.split(close + close).join(close);
}

const TABLE_CONSTRAINT_WORDS = ["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"];
const COLUMN_CONSTRAINT_WORDS = [
  "CONSTRAINT",
  "PRIMARY",
  "NOT",
  "NULL",
  "UNIQUE",
  "CHECK",
  "DEFAULT",
  "COLLATE",
  "REFERENCES",
  "GENERATED",
  "AS"
];

/** Whether tokens[index] opens a new column constraint rather than continuing the current one
 * (e.g. `SET NULL`, `SET DEFAULT`, `NOT DEFERRABLE` and `GENERATED ALWAYS AS` do not). */
function startsColumnConstraint(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  if (!isWord(token, ...COLUMN_CONSTRAINT_WORDS)) return false;
  const previous = tokens[index - 1];
  const word = token?.text.toUpperCase();
  if ((word === "NULL" || word === "DEFAULT") && isWord(previous, "SET")) return false;
  if (word === "NULL" && isWord(previous, "NOT")) return false;
  if (word === "NOT") return isWord(tokens[index + 1], "NULL");
  if (word === "AS") return !isWord(previous, "ALWAYS");
  return true;
}

function splitColumnSegments(tokens: Token[], from: number): ColumnSegment[] {
  const segments: ColumnSegment[] = [];
  let index = from;
  while (index < tokens.length) {
    const start = index;
    if (isWord(tokens[index], "CONSTRAINT")) index += 2;
    const keyword = tokens[index]?.text.toUpperCase();
    let kind: ColumnSegment["kind"] = "other";
    if (keyword === "NOT" || keyword === "NULL") kind = "nullability";
    else if (keyword === "DEFAULT") kind = "default";
    else if (keyword === "GENERATED" || keyword === "AS") kind = "generated";

    index += 1;
    if (kind === "default") {
      if (tokens[index]?.text === "+" || tokens[index]?.text === "-") index += 1;
      if (tokens[index]?.text === "(") index = skipParenthesized(tokens, index);
      else index += 1;
    }
    let depth = 0;
    while (index < tokens.length) {
      const text = tokens[index]?.text;
      if (depth === 0 && kind !== "default" && startsColumnConstraint(tokens, index)) break;
      if (kind === "default" && depth === 0) break;
      if (text === "(") depth += 1;
      if (text === ")") depth -= 1;
      index += 1;
    }
    segments.push({ kind, start, end: index });
  }
  return segments;
}

function skipParenthesized(tokens: Token[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    if (tokens[index]?.text === "(") depth += 1;
    if (tokens[index]?.text === ")") depth -= 1;
    if (depth === 0) return index + 1;
  }
  throw unsupportedRebuild("The table definition could not be parsed (unbalanced parentheses).");
}

/** Format a SQLite DDL default literal; booleans use SQLite's integer representation. */
export function formatDefaultLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Default value must be a finite number.");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function rewriteColumnDefinition(sql: string, tokens: Token[], changes: ColumnChanges): string {
  const slice = (from: number, to: number): string =>
    to > from ? sql.slice((tokens[from] as Token).start, (tokens[to - 1] as Token).end) : "";

  let typeEnd = 1;
  let depth = 0;
  while (typeEnd < tokens.length) {
    if (depth === 0 && startsColumnConstraint(tokens, typeEnd)) break;
    if (tokens[typeEnd]?.text === "(") depth += 1;
    if (tokens[typeEnd]?.text === ")") depth -= 1;
    typeEnd += 1;
  }
  const segments = splitColumnSegments(tokens, typeEnd);
  if (segments.some((segment) => segment.kind === "generated")) {
    throw unsupportedRebuild(
      "Generated columns can't be altered here; change the table definition with SQL instead."
    );
  }

  const parts = [slice(0, 1), changes.dataType ?? slice(1, typeEnd)];
  for (const segment of segments) {
    if (segment.kind === "nullability" && changes.nullable !== undefined) continue;
    if (segment.kind === "default" && "default" in changes) continue;
    parts.push(slice(segment.start, segment.end));
  }
  if (changes.nullable === false) parts.push("NOT NULL");
  if ("default" in changes && changes.default !== null && changes.default !== undefined) {
    parts.push(`DEFAULT ${formatDefaultLiteral(changes.default)}`);
  }
  return parts.filter(Boolean).join(" ");
}

/** Rewrite a stored `CREATE TABLE` statement under a new name with one column's type, nullability,
 * or default changed, keeping every other column and table constraint and table option verbatim. */
export function rewriteCreateTableSql(
  sql: string,
  newTableName: string,
  column: string,
  changes: ColumnChanges
): string {
  const tokens = tokenize(sql);
  let index = 0;
  const expect = (ok: boolean): void => {
    if (!ok) throw unsupportedRebuild("The table definition could not be parsed.");
  };
  expect(isWord(tokens[index++], "CREATE"));
  if (isWord(tokens[index], "TEMP", "TEMPORARY")) index += 1;
  expect(isWord(tokens[index++], "TABLE"));
  if (isWord(tokens[index], "IF")) index += 3;
  const nameStart = index;
  expect(isName(tokens[index++]));
  if (tokens[index]?.text === ".") {
    index += 1;
    expect(isName(tokens[index++]));
  }
  const nameEnd = index;
  expect(tokens[index]?.text === "(");
  const bodyClose = skipParenthesized(tokens, index) - 1;

  const items: Array<{ from: number; to: number }> = [];
  let itemStart = index + 1;
  let depth = 0;
  for (let cursor = index + 1; cursor <= bodyClose; cursor += 1) {
    const text = tokens[cursor]?.text;
    if (text === "(") depth += 1;
    if (text === ")" && cursor !== bodyClose) depth -= 1;
    if ((text === "," && depth === 0) || cursor === bodyClose) {
      expect(cursor > itemStart);
      items.push({ from: itemStart, to: cursor });
      itemStart = cursor + 1;
    }
  }

  const target = items.find(({ from }) => {
    const first = tokens[from] as Token;
    if (first.kind === "word" && isWord(first, ...TABLE_CONSTRAINT_WORDS)) return false;
    return isName(first) && unquote(first).toLowerCase() === column.toLowerCase();
  });
  if (!target) {
    throw unsupportedRebuild(`Column "${column}" was not found in the table definition.`);
  }
  const rewritten = rewriteColumnDefinition(sql, tokens.slice(target.from, target.to), changes);

  const targetStart = (tokens[target.from] as Token).start;
  const targetEnd = (tokens[target.to - 1] as Token).end;
  return (
    sql.slice(0, (tokens[nameStart] as Token).start) +
    quoteIdent(newTableName) +
    sql.slice((tokens[nameEnd - 1] as Token).end, targetStart) +
    rewritten +
    sql.slice(targetEnd)
  );
}
